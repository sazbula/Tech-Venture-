"""
Graph Visualization Generator

Creates an interactive HTML visualization of the code graph.
Opens directly in browser - no npm/node required.
"""

import json
import pickle
import webbrowser
import sys
from pathlib import Path


HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Contextify - {repo_name}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #fff;
            overflow: hidden;
        }}
        #header {{
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            padding: 15px 20px;
            background: rgba(26, 26, 46, 0.95);
            border-bottom: 1px solid #2a2a4a;
            z-index: 100;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        #header h1 {{
            font-size: 1.5rem;
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        #stats {{
            color: #888;
            font-size: 0.9rem;
        }}
        #stats span {{
            margin-left: 20px;
        }}
        #graph {{
            width: 100vw;
            height: 100vh;
            padding-top: 60px;
        }}
        #legend {{
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(26, 26, 46, 0.95);
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #2a2a4a;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            margin: 5px 0;
            font-size: 0.85rem;
            color: #888;
        }}
        .legend-dot {{
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }}
        #tooltip {{
            position: fixed;
            background: rgba(26, 26, 46, 0.95);
            border: 1px solid #2a2a4a;
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 0.85rem;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            max-width: 400px;
            z-index: 200;
        }}
        #tooltip.visible {{ opacity: 1; }}
        #tooltip .name {{ color: #00d9ff; font-weight: 600; margin-bottom: 5px; }}
        #tooltip .info {{ color: #888; }}
        #controls {{
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
        }}
        #controls button {{
            padding: 8px 16px;
            background: rgba(26, 26, 46, 0.95);
            border: 1px solid #2a2a4a;
            color: #888;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }}
        #controls button:hover {{
            border-color: #00d9ff;
            color: #00d9ff;
        }}
        .node {{ cursor: pointer; }}
        .node text {{
            font-size: 10px;
            fill: #ccc;
            pointer-events: none;
        }}
        .link {{
            stroke: #444;
            stroke-opacity: 0.6;
        }}
        .link:hover {{
            stroke: #00d9ff;
            stroke-opacity: 1;
        }}
    </style>
</head>
<body>
    <div id="header">
        <h1>Contextify - {repo_name}</h1>
        <div id="stats">
            <span>{node_count} nodes</span>
            <span>{edge_count} edges</span>
            <span>{file_count} files</span>
        </div>
    </div>

    <div id="graph"></div>

    <div id="legend">
        <div class="legend-item">
            <div class="legend-dot" style="background: #00d9ff;"></div>
            <span>File</span>
        </div>
        <div class="legend-item">
            <div class="legend-dot" style="background: #ff6b6b;"></div>
            <span>Class</span>
        </div>
        <div class="legend-item">
            <div class="legend-dot" style="background: #00ff88;"></div>
            <span>Function</span>
        </div>
        <div class="legend-item">
            <div class="legend-dot" style="background: #ffd93d;"></div>
            <span>Method</span>
        </div>
    </div>

    <div id="tooltip">
        <div class="name"></div>
        <div class="info"></div>
    </div>

    <div id="controls">
        <button onclick="resetZoom()">Reset View</button>
        <button onclick="toggleLabels()">Toggle Labels</button>
    </div>

    <script>
        const data = {graph_data};

        const width = window.innerWidth;
        const height = window.innerHeight - 60;

        const colorMap = {{
            'file': '#00d9ff',
            'class': '#ff6b6b',
            'function': '#00ff88',
            'method': '#ffd93d',
            'interface': '#bf94ff',
            'struct': '#ff94c2',
            'default': '#888'
        }};

        // Size based on out-degree (nodes with more connections are bigger)
        const outDegree = {{}};
        data.links.forEach(link => {{
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            outDegree[sourceId] = (outDegree[sourceId] || 0) + 1;
        }});

        const minSize = 4;
        const maxSize = 25;
        const maxDegree = Math.max(...Object.values(outDegree), 1);

        function getNodeSize(d) {{
            const degree = outDegree[d.id] || 0;
            return minSize + (degree / maxDegree) * (maxSize - minSize);
        }}

        let showLabels = true;

        // Create SVG
        const svg = d3.select("#graph")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Add zoom behavior
        const g = svg.append("g");

        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => {{
                g.attr("transform", event.transform);
            }});

        svg.call(zoom);

        // Create simulation with DAG-friendly forces
        const simulation = d3.forceSimulation(data.nodes)
            .force("link", d3.forceLink(data.links).id(d => d.id).distance(100).strength(0.5))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(d => getNodeSize(d) + 15))
            .force("y", d3.forceY(height / 2).strength(0.05));

        // Draw links
        const link = g.append("g")
            .selectAll("line")
            .data(data.links)
            .join("line")
            .attr("class", "link")
            .attr("stroke-width", 1)
            .attr("marker-end", "url(#arrow)");

        // Add arrow marker
        svg.append("defs").append("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 20)
            .attr("refY", 0)
            .attr("markerWidth", 8)
            .attr("markerHeight", 8)
            .attr("orient", "auto")
            .append("path")
            .attr("fill", "#666")
            .attr("d", "M0,-5L10,0L0,5");

        // Draw nodes
        const node = g.append("g")
            .selectAll("g")
            .data(data.nodes)
            .join("g")
            .attr("class", "node")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        node.append("circle")
            .attr("r", d => getNodeSize(d))
            .attr("fill", d => colorMap[d.category] || colorMap.default);

        node.append("text")
            .attr("dx", 12)
            .attr("dy", 4)
            .text(d => d.name.split('/').pop().split('.')[0]);

        // Tooltip
        const tooltip = d3.select("#tooltip");

        node.on("mouseover", (event, d) => {{
            tooltip.select(".name").text(d.name);
            tooltip.select(".info").text(
                `Category: ${{d.category}}\\nLanguage: ${{d.language || 'N/A'}}\\nFile: ${{d.file || d.name}}`
            );
            tooltip.classed("visible", true)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 10) + "px");
        }})
        .on("mouseout", () => {{
            tooltip.classed("visible", false);
        }});

        // Update positions
        simulation.on("tick", () => {{
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node.attr("transform", d => `translate(${{d.x}},${{d.y}})`);
        }});

        // Drag functions
        function dragstarted(event) {{
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }}

        function dragged(event) {{
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }}

        function dragended(event) {{
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }}

        // Control functions
        function resetZoom() {{
            svg.transition().duration(500).call(
                zoom.transform,
                d3.zoomIdentity.translate(0, 0).scale(1)
            );
        }}

        function toggleLabels() {{
            showLabels = !showLabels;
            node.selectAll("text").style("display", showLabels ? "block" : "none");
        }}
    </script>
</body>
</html>
"""


def generate_visualization(repo_name: str, output_dir: Path = None, open_browser: bool = True) -> Path:
    """
    Generate an interactive HTML visualization of the code graph.

    Args:
        repo_name: Name of the analyzed repository
        output_dir: Directory containing graph.pkl (defaults to ./output/{repo_name})
        open_browser: Whether to open the visualization in browser

    Returns:
        Path to the generated HTML file
    """
    if output_dir is None:
        output_dir = Path("./output") / repo_name
    else:
        output_dir = Path(output_dir)

    graph_path = output_dir / "graph.pkl"
    tags_path = output_dir / "tags.json"

    if not graph_path.exists():
        raise FileNotFoundError(f"Graph not found: {graph_path}")

    # Load graph
    with open(graph_path, "rb") as f:
        G = pickle.load(f)

    # Load tags for additional info
    tags_map = {}
    if tags_path.exists():
        with open(tags_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    tag = json.loads(line)
                    tags_map[tag["name"]] = tag

    # Build visualization data
    nodes = []
    node_ids = set()

    for node_id in G.nodes():
        tag = tags_map.get(node_id, {})
        node_data = {
            "id": node_id,
            "name": node_id,
            "category": G.nodes[node_id].get("category", tag.get("category", "unknown")),
            "language": G.nodes[node_id].get("language", tag.get("language", "")),
            "file": G.nodes[node_id].get("file", tag.get("rel_fname", "")),
        }
        nodes.append(node_data)
        node_ids.add(node_id)

    # Build links as DAG (remove bidirectional edges, keep only one direction)
    links = []
    seen_edges = set()
    for source, target in G.edges():
        if source in node_ids and target in node_ids:
            # Create a canonical edge representation to detect bidirectional
            edge_pair = tuple(sorted([source, target]))
            if edge_pair not in seen_edges:
                seen_edges.add(edge_pair)
                links.append({"source": source, "target": target})

    graph_data = {"nodes": nodes, "links": links}

    # Count files
    file_count = sum(1 for n in nodes if n["category"] == "file")

    # Generate HTML
    html = HTML_TEMPLATE.format(
        repo_name=repo_name,
        node_count=len(nodes),
        edge_count=len(links),
        file_count=file_count,
        graph_data=json.dumps(graph_data)
    )

    # Save HTML
    html_path = output_dir / "graph.html"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Visualization saved to: {html_path}")

    if open_browser:
        webbrowser.open(f"file://{html_path.absolute()}")

    return html_path


def main():
    if len(sys.argv) < 2:
        print("Usage: python visualize.py <repo_name> [--no-open]")
        print("Example: python visualize.py pomodoro-productivity-app")
        sys.exit(1)

    repo_name = sys.argv[1]
    open_browser = "--no-open" not in sys.argv

    generate_visualization(repo_name, open_browser=open_browser)


if __name__ == "__main__":
    main()
