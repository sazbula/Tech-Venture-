import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import './GraphVisualization.css';

function GraphVisualization({ data, onNodeClick }) {
  const graphRef = useRef();

  // Color scheme for node types
  const colors = useMemo(() => ({
    file: '#00d9ff',
    class: '#ff6b6b',
    function: '#00ff88',
    method: '#ffd93d',
    interface: '#bf94ff',
    struct: '#ff94c2',
    default: '#888',
  }), []);

  // Calculate out-degree for each node (for sizing)
  const outDegree = useMemo(() => {
    if (!data?.links) return {};
    const degree = {};
    data.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      degree[sourceId] = (degree[sourceId] || 0) + 1;
    });
    return degree;
  }, [data]);

  // Remove bidirectional edges to create DAG
  const dagData = useMemo(() => {
    if (!data?.nodes || !data?.links) return data;

    const seenEdges = new Set();
    const dagLinks = [];

    data.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      const edgePair = [sourceId, targetId].sort().join('->');

      if (!seenEdges.has(edgePair)) {
        seenEdges.add(edgePair);
        dagLinks.push(link);
      }
    });

    return { nodes: data.nodes, links: dagLinks };
  }, [data]);

  const maxDegree = useMemo(() => {
    return Math.max(...Object.values(outDegree), 1);
  }, [outDegree]);

  // Get node size based on out-degree
  const getNodeSize = useCallback((node) => {
    const minSize = 4;
    const maxSize = 25;
    const degree = outDegree[node.id] || 0;
    return minSize + (degree / maxDegree) * (maxSize - minSize);
  }, [outDegree, maxDegree]);

  // Node painting function
  const paintNode = useCallback((node, ctx, globalScale) => {
    const label = node.name?.split('/').pop()?.split('.')[0] || node.id;
    const fontSize = Math.max(12 / globalScale, 4);
    const nodeSize = getNodeSize(node);

    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = colors[node.group] || colors[node.category] || colors.default;
    ctx.fill();

    // Add border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw label if zoomed in enough
    if (globalScale > 0.4) {
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, node.x, node.y + nodeSize + fontSize);
    }
  }, [colors, getNodeSize]);

  // Handle node click
  const handleNodeClick = useCallback((node) => {
    if (onNodeClick) {
      onNodeClick(node);
    }

    // Center on node
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
  }, [onNodeClick]);

  // Handle background click to reset zoom
  const handleBackgroundClick = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400);
    }
  }, []);

  // Initial zoom to fit
  useEffect(() => {
    if (graphRef.current && dagData?.nodes?.length) {
      setTimeout(() => {
        graphRef.current.zoomToFit(400, 50);
      }, 500);
    }
  }, [dagData]);

  if (!dagData || !dagData.nodes || dagData.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p>No graph data available</p>
      </div>
    );
  }

  return (
    <div className="graph-visualization">
      <div className="graph-container">
        <ForceGraph2D
          ref={graphRef}
          graphData={dagData}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node, color, ctx) => {
            const nodeSize = getNodeSize(node) + 2;
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkColor={() => 'rgba(100, 100, 100, 0.5)'}
          linkWidth={1.5}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={0}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          backgroundColor="#1a1a2e"
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          d3Force={(engine) => {
            engine.force('charge').strength(-300);
            engine.force('link').distance(100);
            engine.force('collision', null);
          }}
        />
      </div>

      <div className="graph-legend">
        <div className="legend-item">
          <span className="legend-dot file"></span>
          <span>File</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot class"></span>
          <span>Class</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot function"></span>
          <span>Function</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot method"></span>
          <span>Method</span>
        </div>
        <div className="legend-info">
          Larger nodes = more connections
        </div>
      </div>

      <div className="graph-controls">
        <button onClick={() => graphRef.current?.zoomToFit(400)}>
          Fit View
        </button>
        <button onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 200)}>
          Zoom In
        </button>
        <button onClick={() => graphRef.current?.zoom(graphRef.current.zoom() / 1.5, 200)}>
          Zoom Out
        </button>
      </div>
    </div>
  );
}

export default GraphVisualization;
