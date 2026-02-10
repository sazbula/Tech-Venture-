"""
Graph API Module

Python API for accessing and querying RepoGraph data.
Provides functions to load graphs, query nodes/edges, and serialize for web consumption.
"""

import pickle
import json
import networkx as nx
from pathlib import Path
from typing import Optional, Any
from dataclasses import dataclass, asdict


@dataclass
class NodeInfo:
    """Information about a graph node."""
    id: str
    name: str
    category: str  # 'class' or 'function'
    kind: str  # 'def' or 'ref'
    file: str
    line: list[int]
    info: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class EdgeInfo:
    """Information about a graph edge."""
    source: str
    target: str

    def to_dict(self) -> dict:
        return asdict(self)


class GraphAPI:
    """
    Python API for accessing RepoGraph data.

    Usage:
        api = GraphAPI("./output/my-repo")
        api.load()

        # Get all nodes
        nodes = api.get_nodes()

        # Search for a function
        results = api.search("my_function")

        # Get node neighbors
        neighbors = api.get_neighbors("MyClass")
    """

    def __init__(self, repo_output_dir: str | Path):
        """
        Initialize GraphAPI with path to repo output directory.

        Args:
            repo_output_dir: Directory containing graph.pkl and tags.json
        """
        self.output_dir = Path(repo_output_dir)
        self.graph_path = self.output_dir / "graph.pkl"
        self.tags_path = self.output_dir / "tags.json"
        self.graph: Optional[nx.MultiDiGraph] = None
        self.tags: list[dict] = []
        self._node_index: dict[str, dict] = {}

    def load(self) -> "GraphAPI":
        """Load the graph and tags from disk."""
        if not self.graph_path.exists():
            raise FileNotFoundError(f"Graph not found: {self.graph_path}")

        # Load NetworkX graph
        with open(self.graph_path, "rb") as f:
            self.graph = pickle.load(f)

        # Load tags
        self.tags = []
        if self.tags_path.exists():
            with open(self.tags_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        self.tags.append(json.loads(line))

        # Build node index from tags
        self._build_node_index()

        return self

    def _build_node_index(self):
        """Build an index of nodes by name for fast lookup."""
        self._node_index = {}
        for tag in self.tags:
            name = tag["name"]
            if name not in self._node_index:
                self._node_index[name] = tag
            elif tag["kind"] == "def":
                # Prefer definitions over references
                self._node_index[name] = tag

    def get_nodes(self, kind: Optional[str] = None, category: Optional[str] = None) -> list[NodeInfo]:
        """
        Get all nodes in the graph.

        Args:
            kind: Filter by kind ('def' or 'ref')
            category: Filter by category ('class' or 'function')

        Returns:
            List of NodeInfo objects
        """
        nodes = []
        for tag in self.tags:
            if kind and tag["kind"] != kind:
                continue
            if category and tag["category"] != category:
                continue
            nodes.append(NodeInfo(
                id=tag["name"],
                name=tag["name"],
                category=tag["category"],
                kind=tag["kind"],
                file=tag["rel_fname"],
                line=tag["line"],
                info=tag["info"],
            ))
        return nodes

    def get_definitions(self) -> list[NodeInfo]:
        """Get all definition nodes (functions and classes)."""
        return self.get_nodes(kind="def")

    def get_classes(self) -> list[NodeInfo]:
        """Get all class definitions."""
        return self.get_nodes(kind="def", category="class")

    def get_functions(self) -> list[NodeInfo]:
        """Get all function definitions."""
        return self.get_nodes(kind="def", category="function")

    def get_edges(self) -> list[EdgeInfo]:
        """Get all edges in the graph."""
        if not self.graph:
            raise RuntimeError("Graph not loaded. Call load() first.")

        edges = []
        for source, target in self.graph.edges():
            edges.append(EdgeInfo(source=source, target=target))
        return edges

    def get_node(self, name: str) -> Optional[NodeInfo]:
        """Get a specific node by name."""
        tag = self._node_index.get(name)
        if not tag:
            return None
        return NodeInfo(
            id=tag["name"],
            name=tag["name"],
            category=tag["category"],
            kind=tag["kind"],
            file=tag["rel_fname"],
            line=tag["line"],
            info=tag["info"],
        )

    def get_neighbors(self, name: str, depth: int = 1) -> list[str]:
        """
        Get neighbor nodes of a given node.

        Args:
            name: Node name
            depth: How many hops to traverse (1 = direct neighbors)

        Returns:
            List of neighbor node names
        """
        if not self.graph:
            raise RuntimeError("Graph not loaded. Call load() first.")

        if name not in self.graph:
            return []

        if depth == 1:
            return list(self.graph.neighbors(name))

        # BFS for multi-hop neighbors
        visited = set()
        queue = [(name, 0)]

        while queue:
            node, level = queue.pop(0)
            if node in visited:
                continue
            visited.add(node)

            if level < depth and node in self.graph:
                for neighbor in self.graph.neighbors(node):
                    if neighbor not in visited:
                        queue.append((neighbor, level + 1))

        visited.discard(name)  # Remove the starting node
        return list(visited)

    def get_predecessors(self, name: str) -> list[str]:
        """Get nodes that reference this node."""
        if not self.graph:
            raise RuntimeError("Graph not loaded. Call load() first.")

        if name not in self.graph:
            return []

        return list(self.graph.predecessors(name))

    def search(self, query: str, exact: bool = False) -> list[NodeInfo]:
        """
        Search for nodes by name.

        Args:
            query: Search term
            exact: If True, require exact match. If False, substring match.

        Returns:
            List of matching NodeInfo objects
        """
        results = []
        query_lower = query.lower()

        for tag in self.tags:
            name = tag["name"]
            if exact:
                if name == query:
                    results.append(self._tag_to_node_info(tag))
            else:
                if query_lower in name.lower():
                    results.append(self._tag_to_node_info(tag))

        return results

    def _tag_to_node_info(self, tag: dict) -> NodeInfo:
        """Convert a tag dict to NodeInfo."""
        return NodeInfo(
            id=tag["name"],
            name=tag["name"],
            category=tag["category"],
            kind=tag["kind"],
            file=tag["rel_fname"],
            line=tag["line"],
            info=tag["info"],
        )

    def get_files(self) -> list[str]:
        """Get list of all files in the graph."""
        files = set()
        for tag in self.tags:
            files.add(tag["rel_fname"])
        return sorted(files)

    def get_file_nodes(self, filename: str) -> list[NodeInfo]:
        """Get all nodes in a specific file."""
        nodes = []
        for tag in self.tags:
            if tag["rel_fname"] == filename:
                nodes.append(self._tag_to_node_info(tag))
        return nodes

    def to_json(self) -> dict:
        """
        Export graph data as JSON-serializable dict for web consumption.

        Returns:
            Dict with nodes, edges, and metadata
        """
        definitions = self.get_definitions()
        edges = self.get_edges()

        # Deduplicate nodes for visualization
        seen_nodes = set()
        unique_nodes = []
        for node in definitions:
            if node.name not in seen_nodes:
                seen_nodes.add(node.name)
                unique_nodes.append(node.to_dict())

        return {
            "nodes": unique_nodes,
            "edges": [e.to_dict() for e in edges],
            "files": self.get_files(),
            "stats": {
                "total_nodes": len(self.graph.nodes) if self.graph else 0,
                "total_edges": len(self.graph.edges) if self.graph else 0,
                "definitions": len(definitions),
                "files": len(self.get_files()),
            }
        }

    def to_vis_format(self, files_only: bool = False) -> dict:
        """
        Export graph in format suitable for visualization libraries.

        Compatible with:
        - vis.js
        - react-force-graph
        - D3.js force layout

        Args:
            files_only: If True, only include file nodes (better for large repos)

        Returns:
            Dict with nodes and links arrays
        """
        if not self.graph:
            raise RuntimeError("Graph not loaded. Call load() first.")

        # Get nodes based on mode
        if files_only:
            # Get file nodes directly from graph (not from tags)
            all_nodes = []
            for node_id, attrs in self.graph.nodes(data=True):
                if attrs.get("category") == "file":
                    all_nodes.append(NodeInfo(
                        id=node_id,
                        name=node_id,
                        category="file",
                        kind=attrs.get("kind", "def"),
                        file=attrs.get("file", node_id),
                        line=attrs.get("line", [0, 0]),
                        info=attrs.get("info", ""),
                    ))
        else:
            all_nodes = self.get_definitions()

        edges = self.get_edges()

        # Create node map with unique IDs
        node_map = {}
        nodes = []

        for node in all_nodes:
            if node.name not in node_map:
                node_map[node.name] = {
                    "id": node.name,
                    "name": node.name,
                    "category": node.category,  # Use category directly
                    "group": node.category,     # Keep for compatibility
                    "file": node.file,
                }
                nodes.append(node_map[node.name])

        # Create links (only for nodes that exist)
        links = []
        seen_edges = set()
        for edge in edges:
            if edge.source in node_map and edge.target in node_map:
                # Make DAG - remove bidirectional edges
                edge_pair = tuple(sorted([edge.source, edge.target]))
                if edge_pair not in seen_edges:
                    seen_edges.add(edge_pair)
                    links.append({
                        "source": edge.source,
                        "target": edge.target,
                    })

        return {
            "nodes": nodes,
            "links": links,
        }


# Convenience functions for quick usage
def load_graph(repo_output_dir: str | Path) -> GraphAPI:
    """Load a graph from the output directory."""
    api = GraphAPI(repo_output_dir)
    api.load()
    return api


def search_graph(repo_output_dir: str | Path, query: str) -> list[NodeInfo]:
    """Quick search in a graph."""
    api = load_graph(repo_output_dir)
    return api.search(query)
