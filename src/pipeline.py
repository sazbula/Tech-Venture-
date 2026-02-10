"""
Contextify Pipeline

Orchestrates the full workflow:
GitHub URL → Download Repo → Graph Analysis → Graph Output
"""

import sys
from pathlib import Path
import pickle
from dataclasses import dataclass
from typing import Optional
import shutil

# Handle imports whether running as module or directly
try:
    from .github_fetch import fetch_from_url, parse_github_url, GitHubFetchError, get_repo_info
    from .graph_builder import GraphBuilder
except ImportError:
    from github_fetch import fetch_from_url, parse_github_url, GitHubFetchError, get_repo_info
    from graph_builder import GraphBuilder


@dataclass
class AnalysisResult:
    """Result of repository analysis."""
    repo_name: str
    repo_path: Path
    graph_path: Path
    tags_path: Path
    node_count: int
    edge_count: int
    repo_info: dict


class ContextifyPipeline:
    """Main pipeline for Contextify repository analysis."""

    def __init__(self, output_dir: str = "./output", repos_dir: str = "./repos"):
        self.output_dir = Path(output_dir)
        self.repos_dir = Path(repos_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.repos_dir.mkdir(parents=True, exist_ok=True)

    def analyze(
        self,
        github_url: str,
        force_download: bool = False,
        force_analyze: bool = False
    ) -> AnalysisResult:
        """
        Run the full analysis pipeline on a GitHub repository.

        Args:
            github_url: GitHub repository URL
            force_download: Re-download even if repo exists locally
            force_analyze: Re-analyze even if graph exists

        Returns:
            AnalysisResult with paths to outputs and stats
        """
        # Parse URL and get repo info
        owner, repo = parse_github_url(github_url)
        repo_info = get_repo_info(owner, repo)

        # Set up output paths
        repo_output_dir = self.output_dir / repo
        repo_output_dir.mkdir(parents=True, exist_ok=True)
        graph_path = repo_output_dir / "graph.pkl"
        tags_path = repo_output_dir / "tags.json"

        # Check if already analyzed
        if graph_path.exists() and tags_path.exists() and not force_analyze:
            # Load existing results
            with open(graph_path, "rb") as f:
                G = pickle.load(f)
            return AnalysisResult(
                repo_name=repo,
                repo_path=self.repos_dir / repo,
                graph_path=graph_path,
                tags_path=tags_path,
                node_count=len(G.nodes),
                edge_count=len(G.edges),
                repo_info=repo_info,
            )

        # Step 1: Download repository
        print(f"Downloading {owner}/{repo}...")
        repo_path = fetch_from_url(
            github_url,
            dest=self.repos_dir,
            force=force_download
        )
        print(f"   Downloaded to: {repo_path}")

        # Step 2: Build code graph
        print(f"Analyzing repository structure...")
        builder = GraphBuilder(repo_path)
        G = builder.build()

        stats = builder.get_stats()
        print(f"   Nodes: {stats['nodes']}, Edges: {stats['edges']}")

        if stats['nodes'] == 0:
            raise ValueError(f"No supported source files found in {repo}")

        if stats.get('languages'):
            print(f"   Languages: {stats['languages']}")

        # Step 3: Save outputs
        builder.save(repo_output_dir)

        print(f"Analysis complete!")
        print(f"   Graph saved to: {graph_path}")
        print(f"   Tags saved to: {tags_path}")

        return AnalysisResult(
            repo_name=repo,
            repo_path=repo_path,
            graph_path=graph_path,
            tags_path=tags_path,
            node_count=stats['nodes'],
            edge_count=stats['edges'],
            repo_info=repo_info,
        )

    def list_analyzed_repos(self) -> list[str]:
        """List all previously analyzed repositories."""
        repos = []
        for item in self.output_dir.iterdir():
            if item.is_dir() and (item / "graph.pkl").exists():
                repos.append(item.name)
        return repos

    def get_analysis(self, repo_name: str) -> Optional[AnalysisResult]:
        """Get analysis result for a previously analyzed repo."""
        repo_output_dir = self.output_dir / repo_name
        graph_path = repo_output_dir / "graph.pkl"
        tags_path = repo_output_dir / "tags.json"

        if not graph_path.exists():
            return None

        with open(graph_path, "rb") as f:
            G = pickle.load(f)

        return AnalysisResult(
            repo_name=repo_name,
            repo_path=self.repos_dir / repo_name,
            graph_path=graph_path,
            tags_path=tags_path,
            node_count=len(G.nodes),
            edge_count=len(G.edges),
            repo_info={"name": repo_name},
        )

    def delete_analysis(self, repo_name: str) -> bool:
        """Delete analysis outputs for a repository."""
        repo_output_dir = self.output_dir / repo_name
        if repo_output_dir.exists():
            shutil.rmtree(repo_output_dir)
            return True
        return False


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: python pipeline.py <github_url> [--force]")
        print("Example: python pipeline.py https://github.com/pallets/flask")
        sys.exit(1)

    url = sys.argv[1]
    force = "--force" in sys.argv

    pipeline = ContextifyPipeline()

    try:
        result = pipeline.analyze(url, force_download=force, force_analyze=force)
        print(f"\nSummary:")
        print(f"   Repository: {result.repo_name}")
        print(f"   Nodes: {result.node_count}")
        print(f"   Edges: {result.edge_count}")
    except GitHubFetchError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
