import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import GraphLegend from "./GraphLegend";
import type { FileNode, Edge } from "@/data/mockData";
import type { Severity } from "@/data/types";

interface FileGraphProps {
  nodes: FileNode[];
  edges: Edge[];
  onNodeClick: (node: FileNode) => void;
  selectedNodeId?: string;
}

const severityFill: Record<Severity, string> = {
  green: "hsl(142, 71%, 45%)",
  yellow: "hsl(48, 96%, 53%)",
  orange: "hsl(25, 95%, 53%)",
  red: "hsl(0, 84%, 60%)",
  purple: "hsl(252, 100%, 68%)",
  gray: "hsl(211, 20%, 40%)",
};

/* ── Tree-based hierarchical layout ────────────────────────────── */
interface ClusterDef {
  id: string;
  label: string;
  depth: number;
  x: number;  // Horizontal position (computed)
  parent: string | null;
  children: string[];
}

interface TreeNode {
  id: string;
  children: TreeNode[];
  width: number;  // Subtree width for layout
}

/**
 * Build a tree structure from folder paths
 */
function buildFolderTree(folders: string[]): Map<string, { parent: string | null; children: string[]; depth: number }> {
  const tree = new Map<string, { parent: string | null; children: string[]; depth: number }>();

  // Initialize root
  tree.set("root", { parent: null, children: [], depth: 0 });

  // Sort folders by depth to process parents before children
  const sortedFolders = [...folders].sort((a, b) => {
    if (a === "root") return -1;
    if (b === "root") return 1;
    const depthA = (a.match(/\//g) || []).length;
    const depthB = (b.match(/\//g) || []).length;
    return depthA - depthB;
  });

  for (const folder of sortedFolders) {
    if (folder === "root") continue;

    // Find parent folder
    const parts = folder.split("/");
    let parent = "root";
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      if (tree.has(parentPath)) {
        parent = parentPath;
      }
    }

    const depth = (folder.match(/\//g) || []).length + 1;
    tree.set(folder, { parent, children: [], depth });

    // Add this folder as child of parent
    const parentNode = tree.get(parent);
    if (parentNode && !parentNode.children.includes(folder)) {
      parentNode.children.push(folder);
    }
  }

  return tree;
}

/**
 * Compute subtree widths for positioning
 */
function computeSubtreeWidths(nodeId: string, tree: Map<string, { parent: string | null; children: string[]; depth: number }>): Map<string, number> {
  const widths = new Map<string, number>();

  function compute(id: string): number {
    const node = tree.get(id);
    if (!node || node.children.length === 0) {
      widths.set(id, 1);
      return 1;
    }

    const childWidths = node.children.map(c => compute(c));
    const totalWidth = childWidths.reduce((a, b) => a + b, 0);
    widths.set(id, Math.max(1, totalWidth));
    return Math.max(1, totalWidth);
  }

  compute(nodeId);
  return widths;
}

/**
 * Generate hierarchical cluster definitions from nodes' folder structure
 */
function generateClusterDefs(nodes: FileNode[]): ClusterDef[] {
  // Get unique folders from nodes
  const folders = new Set<string>();
  for (const node of nodes) {
    folders.add(node.folder);
  }

  // Build tree structure
  const tree = buildFolderTree(Array.from(folders));
  const widths = computeSubtreeWidths("root", tree);

  // Assign x positions using tree layout
  const positions = new Map<string, number>();

  function assignPositions(nodeId: string, leftX: number): void {
    const node = tree.get(nodeId);
    if (!node) return;

    const width = widths.get(nodeId) || 1;
    const centerX = leftX + width / 2;
    positions.set(nodeId, centerX);

    // Position children
    let childX = leftX;
    for (const childId of node.children) {
      const childWidth = widths.get(childId) || 1;
      assignPositions(childId, childX);
      childX += childWidth;
    }
  }

  assignPositions("root", 0);

  // Convert to ClusterDef array
  const clusterDefs: ClusterDef[] = [];
  for (const [folderId, nodeData] of tree) {
    clusterDefs.push({
      id: folderId,
      label: folderId === "root" ? "/ (root)" : folderId + "/",
      depth: nodeData.depth,
      x: positions.get(folderId) || 0,
      parent: nodeData.parent,
      children: nodeData.children,
    });
  }

  return clusterDefs;
}

const CLUSTER_W = 200;
const CLUSTER_GAP_X = 40;
const LEVEL_HEIGHT = 180;  // Vertical spacing between tree levels
const NODE_R = 11;
const NODE_SPACING_X = 50;
const NODE_SPACING_Y = 44;
const CLUSTER_PAD_TOP = 36;
const CLUSTER_PAD_X = 20;
const CLUSTER_PAD_BOTTOM = 20;

function computeLayout(nodes: FileNode[], collapsedClusters: Set<string>, clusterDefs: ClusterDef[]) {
  // Group nodes by folder
  const groups = new Map<string, FileNode[]>();
  for (const n of nodes) {
    const list = groups.get(n.folder) || [];
    list.push(n);
    groups.set(n.folder, list);
  }

  // Compute cluster heights & positions
  const clusterBounds = new Map<
    string,
    { x: number; y: number; w: number; h: number; depth: number; parent: string | null }
  >();
  const nodePositions = new Map<string, { x: number; y: number }>();

  // Find the maximum x position to calculate total width
  const maxX = Math.max(...clusterDefs.map(c => c.x), 1);
  const maxDepth = Math.max(...clusterDefs.map(c => c.depth), 0);

  // First pass: compute heights per depth level to align
  const levelHeights = new Map<number, number>();

  for (const cd of clusterDefs) {
    const members = groups.get(cd.id) || [];
    const collapsed = collapsedClusters.has(cd.id);
    const cols = Math.min(
      members.length,
      Math.max(
        1,
        Math.floor(
          (CLUSTER_W - CLUSTER_PAD_X * 2 + NODE_SPACING_X) / NODE_SPACING_X
        )
      )
    );
    const rows = collapsed ? 0 : Math.ceil(members.length / cols);
    const h = collapsed
      ? CLUSTER_PAD_TOP + 8
      : CLUSTER_PAD_TOP + rows * NODE_SPACING_Y + CLUSTER_PAD_BOTTOM;
    const prev = levelHeights.get(cd.depth) || 0;
    if (h > prev) levelHeights.set(cd.depth, h);
  }

  // Second pass: assign positions using tree layout
  for (const cd of clusterDefs) {
    const members = groups.get(cd.id) || [];
    const collapsed = collapsedClusters.has(cd.id);

    // X position based on tree layout (centered in subtree)
    const cx = 40 + (cd.x - 0.5) * (CLUSTER_W + CLUSTER_GAP_X);

    // Y position based on depth
    let cy = 20;
    for (let d = 0; d < cd.depth; d++) {
      cy += (levelHeights.get(d) || LEVEL_HEIGHT) + 40;
    }

    const cols = Math.min(
      members.length,
      Math.max(
        1,
        Math.floor(
          (CLUSTER_W - CLUSTER_PAD_X * 2 + NODE_SPACING_X) / NODE_SPACING_X
        )
      )
    );
    const rows = collapsed ? 0 : Math.ceil(members.length / cols);
    const h = collapsed
      ? CLUSTER_PAD_TOP + 8
      : CLUSTER_PAD_TOP + rows * NODE_SPACING_Y + CLUSTER_PAD_BOTTOM;

    clusterBounds.set(cd.id, { x: cx, y: cy, w: CLUSTER_W, h, depth: cd.depth, parent: cd.parent });

    if (!collapsed) {
      members.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        nodePositions.set(node.id, {
          x: cx + CLUSTER_PAD_X + col * NODE_SPACING_X + NODE_R + 4,
          y: cy + CLUSTER_PAD_TOP + row * NODE_SPACING_Y + NODE_R + 4,
        });
      });
    }
  }

  // Calculate SVG dimensions
  const svgW = Math.max(800, (maxX + 0.5) * (CLUSTER_W + CLUSTER_GAP_X) + 80);
  let svgH = 20;
  for (let d = 0; d <= maxDepth; d++) {
    svgH += (levelHeights.get(d) || LEVEL_HEIGHT) + 40;
  }
  svgH += 40;

  return { clusterBounds, nodePositions, svgW, svgH, groups };
}

const FileGraph = ({ nodes, edges, onNodeClick, selectedNodeId }: FileGraphProps) => {
  const [zoom, setZoom] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<FileNode | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const toggleCluster = useCallback((id: string) => {
    setCollapsedClusters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleZoom = useCallback((dir: number) => {
    setZoom(z => Math.max(0.3, Math.min(3, z + dir * 0.2)));
  }, []);

  // Mouse wheel zoom handler
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY / 1000; // Normalize wheel delta
      setZoom(z => Math.max(0.3, Math.min(3, z + delta)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Click-drag to pan the canvas (scroll container)
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      };
      container.style.cursor = "grabbing";
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      container.scrollLeft = panStartRef.current.scrollLeft - dx;
      container.scrollTop = panStartRef.current.scrollTop - dy;
    };

    const stopPan = () => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      panStartRef.current = null;
      container.style.cursor = "";
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopPan);
    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopPan);
    };
  }, []);

  // Generate dynamic cluster definitions from nodes
  const clusterDefs = useMemo(
    () => generateClusterDefs(nodes),
    [nodes]
  );

  // Compute severity counts dynamically
  const severityCounts = useMemo(() => ({
    green: nodes.filter(n => n.severity === "green").length,
    yellow: nodes.filter(n => n.severity === "yellow").length,
    orange: nodes.filter(n => n.severity === "orange").length,
    red: nodes.filter(n => n.severity === "red").length,
    purple: nodes.filter(n => n.severity === "purple").length,
    gray: nodes.filter(n => n.severity === "gray").length,
  }), [nodes]);

  const { clusterBounds, nodePositions, svgW, svgH, groups } = useMemo(
    () => computeLayout(nodes, collapsedClusters, clusterDefs),
    [nodes, collapsedClusters, clusterDefs]
  );

  const visibleEdges = useMemo(() => {
    const posSet = nodePositions;
    return edges.filter(e => posSet.has(e.from) && posSet.has(e.to));
  }, [nodePositions, edges]);

  return (
    <div className="w-full h-full relative graph-bg">
      {/* Top controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="w-8 h-8 bg-card/80 backdrop-blur"
          onClick={() => handleZoom(1)}
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="w-8 h-8 bg-card/80 backdrop-blur"
          onClick={() => handleZoom(-1)}
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="w-8 h-8 bg-card/80 backdrop-blur"
          onClick={() => setZoom(1)}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>

        {/* Zoom level indicator */}
        <div className="ml-2 px-2 h-8 bg-card/80 backdrop-blur border border-border rounded-md flex items-center">
          <span className="text-xs text-muted-foreground font-mono">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        {/* Modules is now fixed (not toggle-able) */}
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs gap-1.5 bg-card/80 backdrop-blur cursor-default"
          type="button"
        >
          Modules
        </Button>
      </div>

      {/* Legend */}
      <GraphLegend counts={severityCounts} />

      {/* Graph canvas */}
      <div
        ref={svgContainerRef}
        className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <svg
          width={svgW * zoom}
          height={svgH * zoom}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="min-w-full min-h-full transition-all duration-150"
          style={{ transition: "width 0.15s ease-out, height 0.15s ease-out" }}
        >
          {/* Arrowhead markers - subtle but visible */}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6, 1.5 3" fill="hsl(210, 30%, 45%)" />
            </marker>
            <marker id="arrowhead-highlight" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <polygon points="0 0, 10 4, 0 8, 2 4" fill="hsl(252, 100%, 68%)" />
            </marker>
            {/* Glow filter for highlighted edges */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Cluster hierarchy lines (parent to children) */}
          {clusterDefs.map(cd => {
            if (!cd.parent) return null;
            const parentBounds = clusterBounds.get(cd.parent);
            const childBounds = clusterBounds.get(cd.id);
            if (!parentBounds || !childBounds) return null;

            // Draw line from bottom-center of parent to top-center of child
            const px = parentBounds.x + parentBounds.w / 2;
            const py = parentBounds.y + parentBounds.h;
            const cx = childBounds.x + childBounds.w / 2;
            const cy = childBounds.y;

            const midY = (py + cy) / 2;

            return (
              <path
                key={`hierarchy-${cd.id}`}
                d={`M ${px} ${py} C ${px} ${midY}, ${cx} ${midY}, ${cx} ${cy}`}
                fill="none"
                stroke="hsl(211, 40%, 25%)"
                strokeWidth={2 / zoom}
                strokeDasharray="6 4"
                opacity={0.4}
                style={{ transition: "stroke-width 0.1s" }}
              />
            );
          })}

          {/* Cluster boxes */}
          {clusterDefs.map(cd => {
            const bounds = clusterBounds.get(cd.id);
            if (!bounds) return null;
            const collapsed = collapsedClusters.has(cd.id);
            const memberCount = (groups.get(cd.id) || []).length;

            return (
              <g key={cd.id}>
                <rect
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.w}
                  height={bounds.h}
                  rx={8}
                  fill="hsl(211, 50%, 10%)"
                  stroke="hsl(211, 40%, 18%)"
                  strokeWidth={1 / zoom}
                  style={{ transition: "stroke-width 0.1s" }}
                />
                {/* Cluster header */}
                <g className="cursor-pointer" onClick={() => toggleCluster(cd.id)}>
                  <rect
                    x={bounds.x}
                    y={bounds.y}
                    width={bounds.w}
                    height={28}
                    rx={8}
                    fill="hsl(211, 50%, 13%)"
                  />
                  {/* Bottom corners sharp when expanded */}
                  {!collapsed && (
                    <rect
                      x={bounds.x}
                      y={bounds.y + 16}
                      width={bounds.w}
                      height={12}
                      fill="hsl(211, 50%, 13%)"
                    />
                  )}

                  <text
                    x={bounds.x + 12}
                    y={bounds.y + 18}
                    fontSize={12 / zoom}
                    fill="hsl(211, 30%, 60%)"
                    fontFamily="monospace"
                  >
                    {collapsed ? "▸" : "▾"}
                  </text>
                  <text
                    x={bounds.x + 26}
                    y={bounds.y + 18}
                    fontSize={11 / zoom}
                    fill="hsl(217, 100%, 96%)"
                    fontFamily="'Space Grotesk', sans-serif"
                    fontWeight={600}
                  >
                    {cd.label}
                  </text>
                  <text
                    x={bounds.x + bounds.w - 12}
                    y={bounds.y + 18}
                    fontSize={10 / zoom}
                    fill="hsl(211, 30%, 50%)"
                    textAnchor="end"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {memberCount}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Edges with curved Bezier paths */}
          {visibleEdges.map((edge, i) => {
            const from = nodePositions.get(edge.from)!;
            const to = nodePositions.get(edge.to)!;
            const isHighlighted = hoveredNode
              ? edge.from === hoveredNode.id || edge.to === hoveredNode.id
              : false;

            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) return null;

            const nx = dx / dist;
            const ny = dy / dist;
            const sx = from.x + nx * NODE_R;
            const sy = from.y + ny * NODE_R;
            const ex = to.x - nx * (NODE_R + 10);
            const ey = to.y - ny * (NODE_R + 10);

            // Create curved Bezier path
            // For vertical movement, curve horizontally; for horizontal, curve vertically
            const isMoreVertical = Math.abs(dy) > Math.abs(dx);
            let pathD: string;

            if (isMoreVertical) {
              // Vertical edge - use S-curve
              const midY = (sy + ey) / 2;
              pathD = `M ${sx} ${sy} C ${sx} ${midY}, ${ex} ${midY}, ${ex} ${ey}`;
            } else {
              // Horizontal edge - use gentle curve
              const midX = (sx + ex) / 2;
              const curveOffset = Math.min(30, Math.abs(dy) * 0.5);
              pathD = `M ${sx} ${sy} C ${midX} ${sy - curveOffset}, ${midX} ${ey - curveOffset}, ${ex} ${ey}`;
            }

            return (
              <path
                key={i}
                d={pathD}
                fill="none"
                stroke={isHighlighted ? "hsl(252, 100%, 68%)" : "hsl(210, 30%, 40%)"}
                strokeWidth={isHighlighted ? 2 / zoom : 0.75 / zoom}
                opacity={hoveredNode ? (isHighlighted ? 0.9 : 0) : 0}
                markerEnd={isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead)"}
                filter={isHighlighted ? "url(#glow)" : undefined}
                style={{ transition: "opacity 0.2s, stroke 0.2s, stroke-width 0.2s" }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNode?.id === node.id;
            const hasIssues = node.severity !== "green" && node.severity !== "gray";

            return (
              <g
                key={node.id}
                onClick={hasIssues ? () => onNodeClick(node) : undefined}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                className={hasIssues ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
              >
                {(isSelected || isHovered) && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_R + 6}
                    fill={severityFill[node.severity]}
                    opacity={0.15}
                  />
                )}

                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_R}
                  fill={severityFill[node.severity]}
                  opacity={isSelected ? 1 : isHovered ? 0.9 : 0.7}
                  stroke={isSelected ? "hsl(217, 100%, 96%)" : "transparent"}
                  strokeWidth={isSelected ? 2 / zoom : 0}
                  style={{ transition: "opacity 0.15s, stroke-width 0.1s" }}
                />

                {node.severity === "purple" && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_R + 4}
                    fill="none"
                    stroke={severityFill.purple}
                    strokeWidth={1 / zoom}
                    opacity={0.4}
                    className="animate-pulse"
                    style={{ transition: "stroke-width 0.1s" }}
                  />
                )}

                <text
                  x={pos.x}
                  y={pos.y + NODE_R + 14}
                  textAnchor="middle"
                  fontSize={Math.max(6, 8 / zoom)}
                  fill="hsl(211, 30%, 60%)"
                  fontFamily="'JetBrains Mono', monospace"
                  style={{ transition: "font-size 0.1s" }}
                >
                  {node.path.split("/").pop()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredNode && nodePositions.has(hoveredNode.id) && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-30 pointer-events-none bg-card border border-border rounded-lg px-3 py-2 shadow-xl max-w-[240px]"
            style={{
              left: `${(nodePositions.get(hoveredNode.id)!.x / svgW) * 100}%`,
              top: `${(nodePositions.get(hoveredNode.id)!.y / svgH) * 100 - 4}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <p className="text-xs font-mono text-foreground truncate">{hoveredNode.path.split("/").pop()}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full severity-dot-${hoveredNode.severity}`} />
              <span className="text-xs text-muted-foreground">
                {hoveredNode.issues} issue{hoveredNode.issues !== 1 ? "s" : ""}
              </span>
            </div>
            {hoveredNode.folder !== "root" && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{hoveredNode.folder}/</p>
            )}
            {hoveredNode.topIssue && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{hoveredNode.topIssue}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FileGraph;
