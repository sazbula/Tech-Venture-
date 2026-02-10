"""
Graph Builder for Contextify

Builds a code dependency graph supporting multiple languages.
Uses regex-based parsing for broad language support without heavy dependencies.
"""

import ast
import json
import pickle
import re
import sys
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import Optional
import networkx as nx


# Supported file extensions and their language mappings
LANGUAGE_EXTENSIONS = {
    # Python
    ".py": "python",
    # JavaScript/TypeScript
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    # Web
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".vue": "vue",
    ".svelte": "svelte",
    # JVM
    ".java": "java",
    ".kt": "kotlin",
    ".scala": "scala",
    # C-family
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".cs": "csharp",
    # Go
    ".go": "go",
    # Rust
    ".rs": "rust",
    # Ruby
    ".rb": "ruby",
    # PHP
    ".php": "php",
    # Swift
    ".swift": "swift",
    # Shell
    ".sh": "shell",
    ".bash": "shell",
    # Config/Data
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".xml": "xml",
}

# Regex patterns for extracting definitions by language
DEFINITION_PATTERNS = {
    "python": {
        "class": r"^class\s+(\w+)",
        "function": r"^(?:async\s+)?def\s+(\w+)",
    },
    "javascript": {
        "class": r"^(?:export\s+)?class\s+(\w+)",
        "function": r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)",
        "const_func": r"^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(?.*\)?\s*=>",
        "const_func2": r"^(?:export\s+)?const\s+(\w+)\s*=\s*function",
    },
    "typescript": {
        "class": r"^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)",
        "interface": r"^(?:export\s+)?interface\s+(\w+)",
        "type": r"^(?:export\s+)?type\s+(\w+)",
        "function": r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)",
        "const_func": r"^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(?.*\)?\s*=>",
    },
    "java": {
        "class": r"^(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)",
        "interface": r"^(?:public\s+)?interface\s+(\w+)",
        "method": r"^\s+(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(",
    },
    "go": {
        "struct": r"^type\s+(\w+)\s+struct",
        "interface": r"^type\s+(\w+)\s+interface",
        "function": r"^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(",
    },
    "rust": {
        "struct": r"^(?:pub\s+)?struct\s+(\w+)",
        "enum": r"^(?:pub\s+)?enum\s+(\w+)",
        "trait": r"^(?:pub\s+)?trait\s+(\w+)",
        "function": r"^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)",
        "impl": r"^impl(?:<[^>]+>)?\s+(\w+)",
    },
    "csharp": {
        "class": r"^(?:public\s+|private\s+|internal\s+)?(?:abstract\s+|sealed\s+)?(?:partial\s+)?class\s+(\w+)",
        "interface": r"^(?:public\s+)?interface\s+(\w+)",
        "method": r"^\s+(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(",
    },
    "cpp": {
        "class": r"^class\s+(\w+)",
        "struct": r"^struct\s+(\w+)",
        "function": r"^(?:\w+(?:\s*[*&])?\s+)+(\w+)\s*\([^)]*\)\s*(?:const)?\s*(?:\{|;)",
    },
    "ruby": {
        "class": r"^class\s+(\w+)",
        "module": r"^module\s+(\w+)",
        "function": r"^def\s+(\w+)",
    },
    "php": {
        "class": r"^(?:abstract\s+|final\s+)?class\s+(\w+)",
        "interface": r"^interface\s+(\w+)",
        "function": r"^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?function\s+(\w+)",
    },
    "swift": {
        "class": r"^(?:public\s+|private\s+|internal\s+)?(?:final\s+)?class\s+(\w+)",
        "struct": r"^(?:public\s+|private\s+)?struct\s+(\w+)",
        "protocol": r"^(?:public\s+)?protocol\s+(\w+)",
        "function": r"^(?:public\s+|private\s+)?(?:static\s+)?func\s+(\w+)",
    },
}

# Import patterns by language
IMPORT_PATTERNS = {
    "python": [
        r"^import\s+([\w.]+)",
        r"^from\s+([\w.]+)\s+import",
    ],
    "javascript": [
        r"^import\s+.*?from\s+['\"]([^'\"]+)['\"]",
        r"^import\s+['\"]([^'\"]+)['\"]",
        r"require\(['\"]([^'\"]+)['\"]\)",
    ],
    "typescript": [
        r"^import\s+.*?from\s+['\"]([^'\"]+)['\"]",
        r"^import\s+['\"]([^'\"]+)['\"]",
    ],
    "java": [
        r"^import\s+([\w.]+);",
    ],
    "go": [
        r"^import\s+[\"]([\w./]+)[\"]\s*$",
        r"^\s+[\"]([\w./]+)[\"]\s*$",
    ],
    "rust": [
        r"^use\s+([\w:]+)",
        r"^mod\s+(\w+)",
    ],
    "csharp": [
        r"^using\s+([\w.]+);",
    ],
    "cpp": [
        r"^#include\s+[<\"]([\w./]+)[>\"]",
    ],
    "ruby": [
        r"^require\s+['\"]([^'\"]+)['\"]",
        r"^require_relative\s+['\"]([^'\"]+)['\"]",
    ],
    "php": [
        r"^(?:require|include)(?:_once)?\s+['\"]([^'\"]+)['\"]",
        r"^use\s+([\w\\]+)",
    ],
}


@dataclass
class CodeNode:
    """Represents a code element (function, class, or file)."""
    name: str
    kind: str  # 'def' or 'ref'
    category: str  # 'class', 'function', 'file', etc.
    file: str
    rel_file: str
    start_line: int
    end_line: int
    language: str
    info: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class GraphBuilder:
    """
    Builds a code dependency graph from a repository.

    Supports multiple programming languages using regex-based parsing.
    """

    def __init__(self, repo_path: str | Path):
        self.repo_path = Path(repo_path)
        self.nodes: list[CodeNode] = []
        self.graph: Optional[nx.DiGraph] = None

    def build(self) -> nx.DiGraph:
        """Build the complete code graph."""
        self.graph = nx.DiGraph()
        self.nodes = []

        # Find all supported files
        all_files = self._find_source_files()

        if not all_files:
            print(f"No supported source files found in {self.repo_path}")
            return self.graph

        print(f"   Found {len(all_files)} source files")

        # Build file map for resolving imports
        file_map = self._build_file_map(all_files)

        # Parse each file
        for file_path in all_files:
            self._parse_file(file_path, file_map)

        # Build edges from imports
        self._build_import_edges(all_files, file_map)

        return self.graph

    def _find_source_files(self) -> list[Path]:
        """Find all supported source files in the repository."""
        files = []

        # Directories to skip
        skip_dirs = {
            "node_modules", ".git", "__pycache__", ".venv", "venv",
            "dist", "build", ".next", ".nuxt", "target", "bin", "obj",
            ".idea", ".vscode", "coverage", ".pytest_cache"
        }

        for file_path in self.repo_path.rglob("*"):
            if file_path.is_file():
                # Skip files in excluded directories
                if any(skip in file_path.parts for skip in skip_dirs):
                    continue

                if file_path.suffix.lower() in LANGUAGE_EXTENSIONS:
                    files.append(file_path)

        return files

    def _build_file_map(self, files: list[Path]) -> dict[str, Path]:
        """Map module/file names to file paths."""
        file_map = {}
        for f in files:
            rel = f.relative_to(self.repo_path)
            # Add with extension
            file_map[str(rel)] = f
            # Add without extension
            file_map[str(rel.with_suffix(""))] = f
            # Add just the filename
            file_map[f.stem] = f
            # Add relative path with forward slashes
            file_map[str(rel).replace("\\", "/")] = f
        return file_map

    def _get_language(self, file_path: Path) -> str:
        """Get the language for a file."""
        return LANGUAGE_EXTENSIONS.get(file_path.suffix.lower(), "unknown")

    def _parse_file(self, file_path: Path, file_map: dict):
        """Parse a source file and extract definitions."""
        language = self._get_language(file_path)

        try:
            code = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            print(f"  Skipping {file_path}: {e}")
            return

        rel_path = str(file_path.relative_to(self.repo_path))
        lines = code.splitlines()

        # Create file node
        file_node_name = rel_path.replace("\\", "/")
        self.graph.add_node(
            file_node_name,
            category="file",
            kind="def",
            file=rel_path,
            language=language,
            line=[1, len(lines)],
            info=""
        )

        self.nodes.append(CodeNode(
            name=file_node_name,
            kind="def",
            category="file",
            file=str(file_path),
            rel_file=rel_path,
            start_line=1,
            end_line=len(lines),
            language=language,
            info=""
        ))

        # Use Python's AST for Python files (more accurate)
        if language == "python":
            self._parse_python_file(file_path, code, rel_path, lines, file_node_name)
        else:
            # Use regex for other languages
            self._parse_with_regex(language, code, rel_path, lines, file_node_name)

    def _parse_python_file(self, file_path: Path, code: str, rel_path: str, lines: list[str], file_node_name: str):
        """Parse Python file using AST for accurate extraction."""
        try:
            tree = ast.parse(code)
        except SyntaxError:
            # Fall back to regex
            self._parse_with_regex("python", code, rel_path, lines, file_node_name)
            return

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                self._add_node(
                    name=node.name,
                    category="class",
                    rel_path=rel_path,
                    start_line=node.lineno,
                    end_line=node.end_lineno or node.lineno,
                    language="python",
                    parent=file_node_name,
                    info=", ".join(m.name for m in node.body if isinstance(m, ast.FunctionDef))
                )

                # Add methods
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        method_name = f"{node.name}.{item.name}"
                        self._add_node(
                            name=method_name,
                            category="method",
                            rel_path=rel_path,
                            start_line=item.lineno,
                            end_line=item.end_lineno or item.lineno,
                            language="python",
                            parent=node.name
                        )

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Only top-level functions
                if any(node in getattr(n, 'body', []) for n in ast.walk(tree) if isinstance(n, ast.ClassDef)):
                    continue
                self._add_node(
                    name=node.name,
                    category="function",
                    rel_path=rel_path,
                    start_line=node.lineno,
                    end_line=node.end_lineno or node.lineno,
                    language="python",
                    parent=file_node_name
                )

    def _parse_with_regex(self, language: str, code: str, rel_path: str, lines: list[str], file_node_name: str):
        """Parse file using regex patterns."""
        patterns = DEFINITION_PATTERNS.get(language, {})

        for line_num, line in enumerate(lines, 1):
            stripped = line.strip()

            for category, pattern in patterns.items():
                match = re.match(pattern, stripped, re.MULTILINE)
                if match:
                    name = match.group(1)
                    # Normalize category names
                    norm_category = category.split("_")[0]  # const_func -> const
                    if norm_category in ("const", "method"):
                        norm_category = "function"

                    self._add_node(
                        name=name,
                        category=norm_category,
                        rel_path=rel_path,
                        start_line=line_num,
                        end_line=line_num,  # Approximate
                        language=language,
                        parent=file_node_name
                    )
                    break  # Only match one pattern per line

    def _add_node(self, name: str, category: str, rel_path: str, start_line: int,
                  end_line: int, language: str, parent: str, info: str = ""):
        """Add a node to the graph."""
        self.graph.add_node(
            name,
            category=category,
            kind="def",
            file=rel_path,
            language=language,
            line=[start_line, end_line],
            info=info
        )

        # Add edge from parent
        if parent and parent in self.graph:
            self.graph.add_edge(parent, name)

        self.nodes.append(CodeNode(
            name=name,
            kind="def",
            category=category,
            file=str(self.repo_path / rel_path),
            rel_file=rel_path,
            start_line=start_line,
            end_line=end_line,
            language=language,
            info=info
        ))

    def _build_import_edges(self, files: list[Path], file_map: dict):
        """Build edges based on import relationships."""
        for file_path in files:
            try:
                code = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            language = self._get_language(file_path)
            from_file = str(file_path.relative_to(self.repo_path)).replace("\\", "/")
            patterns = IMPORT_PATTERNS.get(language, [])

            for line in code.splitlines():
                for pattern in patterns:
                    matches = re.findall(pattern, line.strip())
                    for match in matches:
                        self._add_import_edge(from_file, match, file_map)

    def _add_import_edge(self, from_file: str, import_path: str, file_map: dict):
        """Add an edge if the import target is in the repo."""
        # Clean up import path
        import_path = import_path.strip("./").replace("\\", "/")

        # Try various ways to resolve the import
        candidates = [
            import_path,
            import_path.replace(".", "/"),
            import_path.split(".")[-1],
            import_path.split("/")[-1],
        ]

        for candidate in candidates:
            # Check if it matches a file in our map
            for key, path in file_map.items():
                if candidate in key or key.endswith(candidate):
                    to_file = str(path.relative_to(self.repo_path)).replace("\\", "/")
                    if from_file != to_file and from_file in self.graph and to_file in self.graph:
                        self.graph.add_edge(from_file, to_file)
                    return

    def save(self, output_dir: str | Path):
        """Save graph and tags to output directory."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Save NetworkX graph
        graph_path = output_dir / "graph.pkl"
        with open(graph_path, "wb") as f:
            pickle.dump(self.graph, f)

        # Save tags as JSONL
        tags_path = output_dir / "tags.json"
        with open(tags_path, "w", encoding="utf-8") as f:
            for node in self.nodes:
                f.write(json.dumps({
                    "fname": node.file,
                    "rel_fname": node.rel_file,
                    "line": [node.start_line, node.end_line],
                    "name": node.name,
                    "kind": node.kind,
                    "category": node.category,
                    "language": node.language,
                    "info": node.info,
                }) + "\n")

        return graph_path, tags_path

    def get_stats(self) -> dict:
        """Get graph statistics."""
        # Count languages
        languages = defaultdict(int)
        for node in self.nodes:
            if node.category == "file":
                languages[node.language] += 1

        return {
            "nodes": len(self.graph.nodes) if self.graph else 0,
            "edges": len(self.graph.edges) if self.graph else 0,
            "definitions": len(self.nodes),
            "languages": dict(languages),
        }


def build_graph(repo_path: str | Path, output_dir: Optional[str | Path] = None) -> tuple[nx.DiGraph, list[CodeNode]]:
    """
    Convenience function to build a graph from a repository.

    Args:
        repo_path: Path to repository
        output_dir: Optional output directory to save results

    Returns:
        Tuple of (NetworkX graph, list of CodeNode objects)
    """
    builder = GraphBuilder(repo_path)
    graph = builder.build()

    if output_dir:
        builder.save(output_dir)

    return graph, builder.nodes


def main():
    if len(sys.argv) < 2:
        print("Usage: python graph_builder.py <repo_path> [output_dir]")
        sys.exit(1)

    repo_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("./output") / repo_path.name

    print(f"Building graph for: {repo_path}")

    builder = GraphBuilder(repo_path)
    builder.build()

    stats = builder.get_stats()
    print(f"  Nodes: {stats['nodes']}")
    print(f"  Edges: {stats['edges']}")
    print(f"  Definitions: {stats['definitions']}")
    print(f"  Languages: {stats['languages']}")

    graph_path, tags_path = builder.save(output_dir)
    print(f"  Graph saved to: {graph_path}")
    print(f"  Tags saved to: {tags_path}")


if __name__ == "__main__":
    main()
