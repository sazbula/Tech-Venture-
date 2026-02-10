"""
Enhanced RLM Repository Scanner

Integrates with Contextify backend infrastructure for code analysis.

Features:
1. Uses existing GraphBuilder for code graph generation
2. Uses existing GitHub fetcher for repository downloads
3. Performs RLM-based code analysis with batched processing
4. Progressive result updates for real-time feedback
"""
import os
import json
import time
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Callable
from rlm import RLM
from dotenv import load_dotenv

# Import existing Contextify infrastructure
from pipeline import ContextifyPipeline
from graph_builder import GraphBuilder, LANGUAGE_EXTENSIONS
from api.graph_api import GraphAPI

# Load environment variables
load_dotenv()


# Simple and direct system prompt
ENHANCED_SYSTEM_PROMPT = """
Analyze source code files for issues. Return ONLY the JSON array, no explanations.

Input: context["files"] (dict of filepath: code)
Files may be in any programming language (Python, JavaScript, TypeScript, Java, C/C++, Go, Rust, Ruby, PHP, Swift, etc.)

Task: Use llm_query_batched to analyze files, then output ONLY the JSON array.

IMPORTANT: Empty files or files with only comments/whitespace should have severity "none".
Do NOT classify empty files as problematic.

Severity levels (use ONLY these exact strings):
- "none"     — No issues found OR file is empty/minimal
- "low"      — Minor style or cosmetic issues
- "medium"   — Potential bugs or moderate code smells
- "high"     — Likely bugs, security risks, or serious design flaws
- "critical" — Confirmed vulnerabilities, data loss risks, or crashes

Description: max 5 words. If unsure, use "Manual review recommended".

```python
import json

files = context["files"]
prompts = []

for fpath, code in files.items():
    safe_path = fpath.replace('\\\\', '/')
    prompts.append(f\'\'\'Find issues in this code. Return JSON array ONLY, no markdown, no explanations.
Use ONLY these severities: "none", "low", "medium", "high", "critical".
If unsure about the description, use "Manual review recommended".

IMPORTANT: The "file" field must be EXACTLY: {safe_path}
Do NOT use class names, function names, or invented paths.

Example format:
[{{"file":"{safe_path}","severity":"high","description":"5 words max"}}]

{code}

JSON array only.\'\'\')

responses = llm_query_batched(prompts)

# Create set of valid file paths for filtering
valid_files = set(fpath.replace('\\\\', '/') for fpath in files.keys())

all_issues = []
files_with_issues = set()

for resp in responses:
    try:
        cleaned = str(resp).strip()
        if '```' in cleaned:
            cleaned = '\\n'.join([line for line in cleaned.split('\\n') if not '```' in line])
        cleaned = cleaned.replace('\\\\\\\\', '/')
        issues = json.loads(cleaned)
        if isinstance(issues, list):
            # Filter out invalid files (hallucinations, class names, etc.)
            for issue in issues:
                if isinstance(issue, dict):
                    file_path = issue.get('file', '').replace('\\\\', '/')
                    # Only include if it matches a real file from our input
                    if file_path in valid_files:
                        all_issues.append(issue)
                        files_with_issues.add(file_path)
    except:
        pass

# Add "none" severity for files that were analyzed but had no issues returned
for fpath in valid_files:
    if fpath not in files_with_issues:
        all_issues.append({
            "file": fpath,
            "severity": "none",
            "description": "No issues found"
        })

print(json.dumps(all_issues))
```

CRITICAL: Output only the final JSON array. NO explanations, NO markdown, NO text. Just the array."""


class EnhancedRLMScanner:
    """Enhanced scanner integrated with Contextify backend infrastructure."""

    def __init__(
        self,
        max_iterations: int = 5,
        progress_callback: Optional[Callable] = None,
        output_dir: str = "./output",
        repos_dir: str = "./repos"
    ):
        """
        Initialize the enhanced scanner.

        Args:
            max_iterations: Max RLM iterations (higher for larger repos)
            progress_callback: Optional callback for progress updates
            output_dir: Directory for analysis outputs
            repos_dir: Directory for downloaded repositories
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment")

        self.rlm = RLM(
            backend="openai",
            backend_kwargs={
                "api_key": api_key,
                "model_name": "gpt-4o",
            },
            custom_system_prompt=ENHANCED_SYSTEM_PROMPT,
            max_iterations=max_iterations,
            verbose=True,
        )

        # Use existing Contextify pipeline
        self.pipeline = ContextifyPipeline(output_dir=output_dir, repos_dir=repos_dir)
        self.progress_callback = progress_callback

    def _notify_progress(self, event_type: str, data: dict):
        """Send progress notification if callback is set."""
        if self.progress_callback:
            self.progress_callback({"type": event_type, **data})

    def _check_previously_analyzed(self, files: Dict[str, str], output_file: str) -> set:
        """Check which files were previously analyzed (unchanged)."""
        if not output_file or not os.path.exists(output_file):
            return set()
        
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                prev = json.load(f)
            
            prev_hashes = prev.get('file_hashes', {})
            previously_analyzed = set()
            
            for file_path, content in files.items():
                file_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()
                if file_path in prev_hashes and prev_hashes[file_path] == file_hash:
                    previously_analyzed.add(file_path)
            
            return previously_analyzed
        except:
            return set()

    # Removed: parse_github_url and clone_github_repo
    # Now using existing infrastructure from github_fetch.py and pipeline.py

    def collect_source_files(
        self,
        directory: str,
        exclude_patterns: List[str] = None
    ) -> Dict[str, str]:
        """
        Collect all supported source files in a directory.

        Args:
            directory: Root directory to scan
            exclude_patterns: Patterns to exclude

        Returns:
            Dictionary mapping file paths to file contents
        """
        if exclude_patterns is None:
            exclude_patterns = [
                "__pycache__",
                ".venv",
                "venv",
                ".git",
                ".pytest_cache",
                "node_modules",
                ".tox",
                "build",
                "dist",
                ".eggs",
                "target",  # Rust/Java build dir
                "bin",     # Binary dirs
                "obj",     # C# build dir
            ]

        files = {}
        root_path = Path(directory).resolve()  # Get absolute path

        print(f"\n[COLLECTING FILES]")
        print(f"Scanning directory: {directory}")
        print(f"Resolved absolute path: {root_path}")
        print(f"Directory exists: {root_path.exists()}")
        print(f"Supported extensions: {', '.join(sorted(LANGUAGE_EXTENSIONS.keys()))}")

        self._notify_progress("collecting_started", {"directory": directory})

        # Get all supported extensions from LANGUAGE_EXTENSIONS
        supported_extensions = set(LANGUAGE_EXTENSIONS.keys())

        for source_file in root_path.rglob("*"):
            if not source_file.is_file():
                continue

            # Check if file has a supported extension
            if source_file.suffix not in supported_extensions:
                continue

            # Check exclusions
            should_exclude = False
            for pattern in exclude_patterns:
                if pattern in str(source_file):
                    should_exclude = True
                    break

            if should_exclude:
                continue

            # Make path relative to root
            relative_path = source_file.relative_to(root_path)

            try:
                with open(source_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    files[str(relative_path)] = content
                    lang = LANGUAGE_EXTENSIONS[source_file.suffix]
                    print(f"  [+] {relative_path} ({len(content)} chars, {lang})")
                    print(f"      Full path: {source_file}")
                    self._notify_progress("file_collected", {"file": str(relative_path), "language": lang})
            except Exception as e:
                print(f"  [!] Failed to read {relative_path}: {e}")

        print(f"\n[SUMMARY]")
        print(f"Total files collected: {len(files)}")
        total_chars = sum(len(content) for content in files.values())
        print(f"Total characters: {total_chars:,}")

        return files

    def scan_repository(self, directory: str, repo_name: Optional[str] = None, skip_graph_building: bool = False) -> dict:
        """
        Scan a repository with RLM using existing graph infrastructure.

        Args:
            directory: Path to repository directory
            repo_name: Optional name for the repository (used for output)
            skip_graph_building: If True, assumes graph is already built (for API usage)

        Returns:
            Dictionary with analysis results
        """
        print("\n" + "="*70)
        print("ENHANCED RLM REPOSITORY SCANNER")
        print("="*70)
        print(f"Directory: {directory}")
        dir_path = Path(directory)
        print(f"Directory exists: {dir_path.exists()}")
        if dir_path.exists():
            all_files = list(dir_path.rglob("*"))
            file_count = sum(1 for f in all_files if f.is_file())
            print(f"Total files in directory: {file_count}")
        print(f"Repo name: {repo_name}")
        print(f"Skip graph building: {skip_graph_building}")

        # Build graph using existing GraphBuilder (unless skipped)
        if not skip_graph_building:
            print("\n[GENERATING CODE GRAPH]")
            self._notify_progress("graph_building", {
                "repo_name": repo_name,
                "status": "Building code graph..."
            })

            builder = GraphBuilder(directory)
            graph = builder.build()

            stats = builder.get_stats()
            print(f"   Nodes: {stats['nodes']}, Edges: {stats['edges']}")
            print(f"   Languages: {stats.get('languages', {})}")

            self._notify_progress("graph_complete", {
                "repo_name": repo_name,
                "nodes": stats['nodes'],
                "edges": stats['edges'],
                "languages": stats.get('languages', {})
            })

            if stats['nodes'] == 0:
                print("\n[ERROR] No supported source files found!")
                return {"error": "No files found"}
        else:
            print("\n[USING EXISTING GRAPH]")
            # When skip_graph_building=True, graph was already built by pipeline
            # Rebuild it here for context (needed for RLM analysis)
            builder = GraphBuilder(directory)
            graph = builder.build()
            stats = builder.get_stats()
            print(f"   Nodes: {stats['nodes']}, Edges: {stats['edges']}")
            print(f"   Languages: {stats.get('languages', {})}")
            
            # If graph rebuild found 0 nodes, emit warning but continue
            # (The original graph might exist with different path structure)
            if stats['nodes'] == 0:
                print("\n[WARNING] Graph rebuild found 0 nodes - path might be incorrect")
                print(f"          Attempting to collect source files anyway from: {directory}")

        # Collect source files for RLM analysis
        print("\n[COLLECTING SOURCE FILES]")
        self._notify_progress("collecting_files", {
            "repo_name": repo_name,
            "status": "Collecting source files..."
        })

        files = self.collect_source_files(directory)

        print(f"Collected {len(files)} source files")
        self._notify_progress("files_collected", {
            "repo_name": repo_name,
            "file_count": len(files)
        })

        if not files:
            print("\n[WARNING] No source files found for RLM analysis!")

            # If both graph has 0 nodes AND no source files, return error
            if stats['nodes'] == 0:
                print("[ERROR] No source files found at all - check repository path")
                return {
                    "error": "No source files found",
                    "directory": str(directory),
                    "files_analyzed": 0,
                    "issues_found": 0
                }

            print("(Graph was built, but no analyzable source files found)")
            return {
                "files_analyzed": 0,
                "issues_found": 0,
                "execution_time": 0,
                "message": "No source files found for RLM analysis"
            }

        # Convert graph to JSON format for RLM context
        # Create a simplified graph representation
        graph_data = {
            "nodes": [{"name": n, **graph.nodes[n]} for n in graph.nodes()],
            "edges": [{"from": u, "to": v} for u, v in graph.edges()],
            "stats": stats
        }

        # Batched RLM analysis
        BATCH_SIZE = 10
        file_items = list(files.items())
        batches = [dict(file_items[i:i + BATCH_SIZE]) for i in range(0, len(file_items), BATCH_SIZE)]

        print(f"\n[RLM ANALYSIS]")
        print(f"Total files: {len(files)}")
        print(f"Batches: {len(batches)} x {BATCH_SIZE} files")

        all_issues = []
        total_execution_time = 0

        # Process each batch
        for batch_num, batch_files in enumerate(batches, 1):
            print(f"\n{'='*70}")
            print(f"BATCH {batch_num}/{len(batches)}")
            print(f"{'='*70}")

            # Notify that this batch is starting
            self._notify_progress("batch_start", {
                "repo_name": repo_name,
                "batch": batch_num,
                "total_batches": len(batches),
                "files_in_batch": len(batch_files)
            })

            # Prepare context for RLM with graph data
            context = {"files": batch_files, "graph": graph_data}

            # Direct and specific query
            query = """Output ONLY the final JSON array. No explanations. No markdown. Just the raw JSON array of issues."""

            # Retry loop: up to 3 attempts with 10s delay between retries
            MAX_RETRIES = 3
            batch_issues = []
            batch_succeeded = False

            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    print(f"Running RLM (attempt {attempt}/{MAX_RETRIES})...")
                    result = self.rlm.completion(prompt=context, root_prompt=query)
                    total_execution_time += result.execution_time

                    # Show what RLM returned
                    print(f"\n{'='*70}")
                    print(f"RLM RETURNED (as Python variable):")
                    print(f"{'='*70}")
                    print(f"Type: {type(result.response)}")
                    print(f"\nValue:")
                    print(repr(result.response))
                    print(f"{'='*70}\n")

                    # Parse response
                    batch_issues = []
                    if isinstance(result.response, list):
                        batch_issues = result.response
                        print(f"✓ Already a list!")
                    elif isinstance(result.response, str):
                        response_str = result.response.strip()

                        # Check if response has FINAL_RESULT markers
                        if "=== FINAL_RESULT ===" in response_str and "=== END_RESULT ===" in response_str:
                            try:
                                start = response_str.index("=== FINAL_RESULT ===") + len("=== FINAL_RESULT ===")
                                end = response_str.index("=== END_RESULT ===")
                                json_str = response_str[start:end].strip()
                                batch_issues = json.loads(json_str)
                                print(f"✓ Extracted from FINAL_RESULT markers")
                            except Exception as e:
                                print(f"✗ Failed to extract from markers: {e}")

                        # Try to extract JSON from markdown code blocks
                        if not batch_issues and "```json" in response_str:
                            try:
                                import re
                                json_match = re.search(r'```json\s*\n([\s\S]*?)\n```', response_str)
                                if json_match:
                                    json_str = json_match.group(1).strip()
                                    batch_issues = json.loads(json_str)
                                    print(f"✓ Extracted JSON from markdown code block")
                            except Exception as e:
                                print(f"✗ Failed to extract from markdown: {e}")

                        # Try direct JSON parsing if we don't have issues yet
                        if not batch_issues:
                            try:
                                batch_issues = json.loads(response_str)
                                print(f"✓ Parsed as JSON")
                            except json.JSONDecodeError as e:
                                print(f"✗ JSON parse failed: {e}")

                                # Try Python literal_eval (handles Python repr format)
                                try:
                                    import ast
                                    batch_issues = ast.literal_eval(response_str)
                                    print(f"✓ Parsed as Python literal (using ast.literal_eval)")
                                except Exception as e2:
                                    print(f"✗ Python literal parse also failed: {e2}")
                                    print(f"String was: {response_str[:300]}...")

                    # Ensure batch_issues is a list
                    if not isinstance(batch_issues, list):
                        batch_issues = []

                    batch_succeeded = True
                    break  # Success — exit retry loop

                except Exception as e:
                    print(f"✗ Batch {batch_num} attempt {attempt} failed: {e}")
                    if attempt < MAX_RETRIES:
                        print(f"  Retrying in 10 seconds...")
                        time.sleep(10)
                    else:
                        print(f"✗ Batch {batch_num} failed after {MAX_RETRIES} attempts")
                        self._notify_progress("batch_error", {
                            "repo_name": repo_name,
                            "batch": batch_num,
                            "total_batches": len(batches),
                            "error": str(e)
                        })

            if not batch_succeeded:
                batch_issues = []

            all_issues.extend(batch_issues)
            print(f"✓ Got {len(batch_issues)} issues ({result.execution_time:.2f}s)")
            print(f"✓ Total so far: {len(all_issues)}")

            # PROGRESSIVE UPDATE: Save after each batch!
            output_dir = Path("analysis")
            if repo_name:
                output_dir = output_dir / repo_name
            output_dir.mkdir(parents=True, exist_ok=True)

            # Group all issues collected so far by file (normalize paths to forward slashes)
            issues_by_file = {}
            for issue in all_issues:
                if isinstance(issue, dict):
                    file = issue.get('file', 'unknown')
                    # Normalize path to forward slashes for consistency
                    normalized_file = file.replace('\\', '/')
                    if normalized_file not in issues_by_file:
                        issues_by_file[normalized_file] = []
                    # Update the file path in the issue itself
                    issue['file'] = normalized_file
                    issues_by_file[normalized_file].append(issue)

            frontend_data = {
                "issues_by_file": issues_by_file,
                "summary": {
                    "total_files": len(files),
                    "files_with_issues": len(issues_by_file),
                    "total_issues": len(all_issues),
                    "critical_issues": len([i for i in all_issues if isinstance(i, dict) and i.get('severity') == 'critical']),
                    "high_issues": len([i for i in all_issues if isinstance(i, dict) and i.get('severity') == 'high']),
                    "batches_completed": batch_num,
                    "total_batches": len(batches)
                }
            }

            output_file = output_dir / "detailed_analysis.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(frontend_data, f, indent=2)

            print(f"[SAVED] Progressive update {batch_num}/{len(batches)} to {output_file}")

            # Notify frontend via progress callback
            self._notify_progress("batch_complete", {
                "repo_name": repo_name,
                "batch": batch_num,
                "total_batches": len(batches),
                "batch_issues": len(batch_issues),
                "total_issues": len(all_issues),
                "issues_by_file": issues_by_file,
                "summary": frontend_data["summary"]
            })

        print(f"\n{'='*70}")
        print(f"DONE: {len(all_issues)} total issues")
        print(f"{'='*70}")

        # Simple output - just print the issues
        print(f"\n{'='*70}")
        print("FINAL RESULTS")
        print(f"{'='*70}")
        print(f"Files analyzed: {len(files)}")
        print(f"Issues found: {len(all_issues)}")
        print(f"Time: {total_execution_time:.2f}s")

        if all_issues:
            print(f"\nISSUES:")
            for i, issue in enumerate(all_issues, 1):
                if isinstance(issue, dict):
                    file = issue.get('file', 'unknown')
                    severity = issue.get('severity', '?').upper()
                    desc = issue.get('description', 'No description')
                    print(f"{i:3}. [{severity:8}] {file:50} {desc}")

        print(f"\n{'='*70}")
        output_dir = Path("analysis")
        if repo_name:
            output_dir = output_dir / repo_name
        print(f"[SAVED] Final results in {output_dir / 'detailed_analysis.json'}")

        # Return minimal data
        return {
            "files_analyzed": len(files),
            "issues_found": len(all_issues),
            "execution_time": total_execution_time,
            "issues": all_issues
        }

    def scan_github_repo(
        self,
        github_url: str,
        force_download: bool = False,
        force_analyze: bool = False
    ) -> dict:
        """
        Download and scan a GitHub repository using existing pipeline.

        Args:
            github_url: GitHub repository URL
            force_download: Re-download even if repo exists locally
            force_analyze: Re-build graph even if it exists

        Returns:
            Dictionary with analysis results
        """
        print("\n" + "="*70)
        print("SCANNING GITHUB REPOSITORY")
        print("="*70)

        # Use existing pipeline to download and build graph
        from github_fetch import parse_github_url

        owner, repo = parse_github_url(github_url)
        print(f"\nRepository: {owner}/{repo}")
        print(f"URL: {github_url}")

        # Download and analyze using pipeline
        print("\n[DOWNLOADING & BUILDING GRAPH]")
        result = self.pipeline.analyze(
            github_url,
            force_download=force_download,
            force_analyze=force_analyze
        )

        print(f"   Repository path: {result.repo_path}")
        print(f"   Graph nodes: {result.node_count}")
        print(f"   Graph edges: {result.edge_count}")

        # Now run RLM analysis on the downloaded repo (skip graph building since we just did it)
        return self.scan_repository(
            directory=str(result.repo_path),
            repo_name=result.repo_name,
            skip_graph_building=True
        )


def main():
    """Run RLM scanner with Contextify infrastructure."""
    import sys

    print("RLM Repository Scanner (Integrated with Contextify)")
    print()

    # Default test repo
    default_repo = "https://github.com/BigosKAR/URL-Shortener.git"

    if len(sys.argv) < 2:
        print(f"Usage: python rlm_scanner.py <path_or_github_url> [--force]")
        print(f"Using default: {default_repo}\n")
        target = default_repo
    else:
        target = sys.argv[1]

    force = "--force" in sys.argv

    scanner = EnhancedRLMScanner(max_iterations=30)

    try:
        if "github.com" in target or "/" in target:
            print(f"Scanning GitHub: {target}\n")
            results = scanner.scan_github_repo(
                target,
                force_download=force,
                force_analyze=force
            )
        else:
            print(f"Scanning local: {target}\n")
            results = scanner.scan_repository(target)

        print("\n[DONE]")
        print(f"Issues found: {results.get('issues_found', 0)}")

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
