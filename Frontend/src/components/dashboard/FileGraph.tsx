import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ZoomIn, ZoomOut, RotateCcw, Box, GitFork, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import GraphLegend from "./GraphLegend";
import { mockEdges, severityCounts } from "@/data/mockData";
import type { FileNode } from "@/data/mockData";
import type { Severity } from "@/data/types";

interface FileGraphProps {
  nodes: FileNode[];
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

/* ── Cluster layout definitions ────────────────────────────── */
interface ClusterDef {
  id: string;
  label: string;
  col: number;
  row: number;
}

const clusterDefs: ClusterDef[] = [
  { id: "root",            label: "/ (root)",          col: 0, row: 0 },
  { id: "src",             label: "src/",              col: 1, row: 0 },
  { id: "src/middleware",   label: "src/middleware/",   col: 0, row: 1 },
  { id: "src/auth",        label: "src/auth/",         col: 1, row: 1 },
  { id: "src/services",    label: "src/services/",     col: 2, row: 1 },
  { id: "tests",           label: "tests/",            col: 3, row: 1 },
  { id: "src/api",         label: "src/api/",          col: 0, row: 2 },
  { id: "src/db",          label: "src/db/",           col: 1, row: 2 },
  { id: "src/utils",       label: "src/utils/",        col: 2, row: 2 },
];

const CLUSTER_W = 230;
const CLUSTER_GAP_X = 30;
const CLUSTER_GAP_Y = 30;
const NODE_R = 11;
const NODE_SPACING_X = 50;
const NODE_SPACING_Y = 44;
const CLUSTER_PAD_TOP = 36;
const CLUSTER_PAD_X = 24;
const CLUSTER_PAD_BOTTOM = 20;
const COLS = 4;

function computeLayout(nodes: FileNode[], collapsedClusters: Set<string>) {
  // Group nodes by folder
  const groups = new Map<string, FileNode[]>();
  for (const n of nodes) {
    const list = groups.get(n.folder) || [];
    list.push(n);
    groups.set(n.folder, list);
  }

  // Compute cluster heights & positions
  const clusterBounds = new Map<string, { x: number; y: number; w: number; h: number }>();
  const nodePositions = new Map<string, { x: number; y: number }>();

  // First pass: compute heights per row to align
  const rowHeights = new Map<number, number>();

  for (const cd of clusterDefs) {
    const members = groups.get(cd.id) || [];
    const collapsed = collapsedClusters.has(cd.id);
    const cols = Math.min(members.length, Math.max(1, Math.floor((CLUSTER_W - CLUSTER_PAD_X * 2 + NODE_SPACING_X) / NODE_SPACING_X)));
    const rows = collapsed ? 0 : Math.ceil(members.length / cols);
    const h = collapsed
      ? CLUSTER_PAD_TOP + 8
      : CLUSTER_PAD_TOP + rows * NODE_SPACING_Y + CLUSTER_PAD_BOTTOM;
    const prev = rowHeights.get(cd.row) || 0;
    if (h > prev) rowHeights.set(cd.row, h);
  }

  // Second pass: assign positions
  // Compute row Y offsets
  const rowY = new Map<number, number>();
  let accY = 20;
  const maxRow = Math.max(...clusterDefs.map(c => c.row));
  for (let r = 0; r <= maxRow; r++) {
    rowY.set(r, accY);
    accY += (rowHeights.get(r) || 100) + CLUSTER_GAP_Y;
  }

  for (const cd of clusterDefs) {
    const members = groups.get(cd.id) || [];
    const collapsed = collapsedClusters.has(cd.id);

    const cx = 20 + cd.col * (CLUSTER_W + CLUSTER_GAP_X);
    const cy = rowY.get(cd.row)!;
    const cols = Math.min(members.length, Math.max(1, Math.floor((CLUSTER_W - CLUSTER_PAD_X * 2 + NODE_SPACING_X) / NODE_SPACING_X)));
    const rows = collapsed ? 0 : Math.ceil(members.length / cols);
    const h = collapsed
      ? CLUSTER_PAD_TOP + 8
      : CLUSTER_PAD_TOP + rows * NODE_SPACING_Y + CLUSTER_PAD_BOTTOM;

    clusterBounds.set(cd.id, { x: cx, y: cy, w: CLUSTER_W, h });

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

  const svgW = COLS * (CLUSTER_W + CLUSTER_GAP_X) + 40;
  const svgH = accY + 20;

  return { clusterBounds, nodePositions, svgW, svgH, groups };
}

const FileGraph = ({ nodes, onNodeClick, selectedNodeId }: FileGraphProps) => {
  const [zoom, setZoom] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<FileNode | null>(null);
  const [viewMode, setViewMode] = useState<"modules" | "functions">("modules");
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());

  const toggleCluster = useCallback((id: string) => {
    setCollapsedClusters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleZoom = useCallback((dir: number) => {
    setZoom(z => Math.max(0.3, Math.min(2.5, z + dir * 0.2)));
  }, []);

  const { clusterBounds, nodePositions, svgW, svgH, groups } = useMemo(
    () => computeLayout(nodes, collapsedClusters),
    [nodes, collapsedClusters]
  );

  const visibleEdges = useMemo(() => {
    const posSet = nodePositions;
    return mockEdges.filter(e => posSet.has(e.from) && posSet.has(e.to));
  }, [nodePositions]);

  return (
    <div className="w-full h-full relative graph-bg">
      {/* Top controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="w-8 h-8 bg-card/80 backdrop-blur" onClick={() => handleZoom(1)}>
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="w-8 h-8 bg-card/80 backdrop-blur" onClick={() => handleZoom(-1)}>
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="w-8 h-8 bg-card/80 backdrop-blur" onClick={() => setZoom(1)}>
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant={viewMode === "modules" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5 bg-card/80 backdrop-blur"
          onClick={() => setViewMode("modules")}
        >
          <Box className="w-3 h-3" /> Modules
        </Button>
        <Button
          variant={viewMode === "functions" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5 bg-card/80 backdrop-blur"
          onClick={() => setViewMode("functions")}
        >
          <GitFork className="w-3 h-3" /> Functions
        </Button>
      </div>

      {/* Legend */}
      <GraphLegend counts={severityCounts} />

      {/* Graph canvas */}
      <div
        className="w-full h-full overflow-auto"
        style={{ touchAction: "none" }}
      >
        <svg
          width={svgW * zoom}
          height={svgH * zoom}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="min-w-full min-h-full"
        >
          {/* Arrowhead marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="hsl(211, 30%, 35%)" />
            </marker>
            <marker
              id="arrowhead-highlight"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="hsl(252, 100%, 68%)" />
            </marker>
          </defs>

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
                  strokeWidth={1}
                />
                {/* Cluster header */}
                <g
                  className="cursor-pointer"
                  onClick={() => toggleCluster(cd.id)}
                >
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
                  {/* Chevron icon */}
                  <text
                    x={bounds.x + 12}
                    y={bounds.y + 18}
                    fontSize={12}
                    fill="hsl(211, 30%, 60%)"
                    fontFamily="monospace"
                  >
                    {collapsed ? "▸" : "▾"}
                  </text>
                  <text
                    x={bounds.x + 26}
                    y={bounds.y + 18}
                    fontSize={11}
                    fill="hsl(217, 100%, 96%)"
                    fontFamily="'Space Grotesk', sans-serif"
                    fontWeight={600}
                  >
                    {cd.label}
                  </text>
                  <text
                    x={bounds.x + bounds.w - 12}
                    y={bounds.y + 18}
                    fontSize={10}
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

          {/* Edges with arrows */}
          {visibleEdges.map((edge, i) => {
            const from = nodePositions.get(edge.from)!;
            const to = nodePositions.get(edge.to)!;
            const isHighlighted = hoveredNode
              ? edge.from === hoveredNode.id || edge.to === hoveredNode.id
              : false;
            // Shorten edge to stop at node border
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) return null;
            const nx = dx / dist;
            const ny = dy / dist;
            const sx = from.x + nx * NODE_R;
            const sy = from.y + ny * NODE_R;
            const ex = to.x - nx * (NODE_R + 8);
            const ey = to.y - ny * (NODE_R + 8);
            return (
              <line
                key={i}
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke={isHighlighted ? "hsl(252, 100%, 68%)" : "hsl(211, 30%, 25%)"}
                strokeWidth={isHighlighted ? 1.5 : 0.8}
                opacity={hoveredNode ? (isHighlighted ? 0.8 : 0.1) : 0.3}
                markerEnd={isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead)"}
                style={{ transition: "opacity 0.2s, stroke 0.2s" }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNode?.id === node.id;
            return (
              <g
                key={node.id}
                onClick={() => onNodeClick(node)}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
              >
                {/* Glow ring */}
                {(isSelected || isHovered) && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_R + 6}
                    fill={severityFill[node.severity]}
                    opacity={0.15}
                  />
                )}
                {/* Main circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_R}
                  fill={severityFill[node.severity]}
                  opacity={isSelected ? 1 : isHovered ? 0.9 : 0.7}
                  stroke={isSelected ? "hsl(217, 100%, 96%)" : "transparent"}
                  strokeWidth={isSelected ? 2 : 0}
                  style={{ transition: "opacity 0.15s" }}
                />
                {/* Critical pulse */}
                {node.severity === "purple" && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_R + 4}
                    fill="none"
                    stroke={severityFill.purple}
                    strokeWidth="1"
                    opacity={0.4}
                    className="animate-pulse"
                  />
                )}
                {/* Label */}
                <text
                  x={pos.x}
                  y={pos.y + NODE_R + 14}
                  textAnchor="middle"
                  fontSize={8}
                  fill="hsl(211, 30%, 60%)"
                  fontFamily="'JetBrains Mono', monospace"
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
            <p className="text-xs font-mono text-foreground truncate">{hoveredNode.path}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full severity-dot-${hoveredNode.severity}`} />
              <span className="text-xs text-muted-foreground">
                {hoveredNode.issues} issue{hoveredNode.issues !== 1 ? "s" : ""}
              </span>
            </div>
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
