"""Stub analysis engine that returns deterministic demo data.

This keeps the async job pipeline intact while providing the shapes
expected by the React frontend (graph + issues).
"""

from typing import Any, Dict, List, Tuple

from .demo_data import build_demo_result


def run_analysis(repo_name: str, repo_url: str | None = None) -> Dict[str, Any]:
    nodes, edges, issues, counts = build_demo_result()
    return {
        "repo_name": repo_name,
        "repo_url": repo_url,
        "graph": {
            "nodes": nodes,
            "edges": edges,
            "severity_counts": counts,
        },
        "issues": issues,
        "meta": {
            "engine": "stub",
            "notes": "Replace with RLM-based analysis in future iterations.",
        },
    }


def summarize_counts(result: Dict[str, Any]) -> Tuple[int, int]:
    graph = result.get("graph", {})
    node_count = len(graph.get("nodes", []))
    edge_count = len(graph.get("edges", []))
    return node_count, edge_count
