import { useState, useEffect, useRef } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import FileGraph from "@/components/dashboard/FileGraph";
import FileDetailsDrawer from "@/components/dashboard/FileDetailsDrawer";
import { mockNodes, mockIssues, mockEdges } from "@/data/mockData";
import type { FileNode, Edge, Issue } from "@/data/mockData";
import AppHeader from "@/components/layout/AppHeader";
import { getGraph, getFileIssues, type GraphNode, type GraphEdge } from "@/services/api";
import { Loader2 } from "lucide-react";

const API_BASE = "http://localhost:8000";

// Helper function to determine severity from issues
// Maps RLM severities (none/low/medium/high/critical) to UI colors
const getSeverityFromIssues = (issues: any[]): FileNode["severity"] => {
  if (issues.length === 0) return "green";

  const hasCritical = issues.some(i => ["critical", "purple"].includes(i.severity));
  const hasHigh = issues.some(i => ["high", "red"].includes(i.severity));
  const hasMedium = issues.some(i => ["medium", "orange"].includes(i.severity));
  const hasLow = issues.some(i => ["low", "yellow"].includes(i.severity));
  const allNone = issues.every(i => ["none", "green"].includes(i.severity));

  if (allNone) return "green";
  if (hasCritical) return "purple";
  if (hasHigh) return "red";
  if (hasMedium) return "orange";
  if (hasLow) return "yellow";
  return "yellow";
};

const Dashboard = () => {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showFlagged, setShowFlagged] = useState(false);
  const [showHighSeverity, setShowHighSeverity] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Graph data state
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rlmInProgress, setRlmInProgress] = useState(false);
  const [issuesByFile, setIssuesByFile] = useState<Record<string, Issue[]>>({});

  // RLM progress details
  const [rlmProgress, setRlmProgress] = useState({
    phase: "Connecting...",
    batch: 0,
    totalBatches: 0,
    issuesFound: 0,
    percent: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch graph data on mount
  useEffect(() => {
    const fetchGraph = async () => {
      const repoName = localStorage.getItem("currentRepo");
      const rlmStatus = localStorage.getItem("rlmInProgress");

      if (!repoName) {
        // No repo selected, use mock data for demo
        setNodes(mockNodes);
        setEdges(mockEdges);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await getGraph(repoName, true);

        // Transform API nodes to FileNode format
        const fileNodes: FileNode[] = data.nodes.map((n: GraphNode, idx: number) => ({
          id: n.id,
          path: n.path,
          folder: n.folder,
          severity: n.severity,
          issues: n.issues,
          topIssue: n.topIssue,
          size: n.size,
          x: 0,
          y: 0,
        }));

        // Transform API edges to Edge format
        const graphEdges: Edge[] = data.edges.map((e: GraphEdge) => ({
          from: e.from,
          to: e.to,
        }));

        setNodes(fileNodes);
        setEdges(graphEdges);
        setError(null);

        // After graph is loaded, connect to SSE for live RLM updates if analysis is in progress
        if (rlmStatus === "true") {
          setRlmInProgress(true);
          connectToSSE(repoName);
        }
      } catch (err) {
        console.error("Failed to fetch graph:", err);
        setError(err instanceof Error ? err.message : "Failed to load graph");
        // Fall back to mock data on error
        setNodes(mockNodes);
        setEdges(mockEdges);
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();

    // Cleanup SSE on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Connect to SSE for live RLM updates
  const connectToSSE = (repoName: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log(`Connecting to SSE for live updates: ${repoName}`);
    eventSourceRef.current = new EventSource(`${API_BASE}/rlm/stream/${repoName}`);

    eventSourceRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Dashboard SSE event:", data);

        // Track progress phases
        if (data.type === "connected") {
          setRlmProgress(prev => ({ ...prev, phase: "Connected to analysis stream" }));
        }

        if (data.type === "graph_building") {
          setRlmProgress(prev => ({ ...prev, phase: "Building dependency graph...", percent: 10 }));
        }

        if (data.type === "graph_complete") {
          setRlmProgress(prev => ({ ...prev, phase: "Graph built, starting analysis...", percent: 20 }));
        }

        if (data.type === "collecting_files") {
          setRlmProgress(prev => ({ ...prev, phase: "Collecting files for analysis...", percent: 25 }));
        }

        if (data.type === "files_collected") {
          setRlmProgress(prev => ({
            ...prev,
            phase: `Found ${data.file_count} files to analyze`,
            percent: 30,
          }));
        }

        if (data.type === "rlm_started") {
          setRlmProgress(prev => ({ ...prev, phase: "AI analysis starting...", percent: 35 }));
        }

        if (data.type === "batch_start") {
          setRlmProgress(prev => ({
            ...prev,
            phase: `Analyzing batch ${data.batch}/${data.total_batches}...`,
            batch: data.batch,
            totalBatches: data.total_batches,
            percent: 35 + ((data.batch - 1) / data.total_batches) * 60,
          }));
        }

        // Update node colors based on batch_complete events
        if (data.type === "batch_complete" && data.issues_by_file) {
          console.log("Batch complete - updating nodes with issues:", data.issues_by_file);
          setNodes(prevNodes => {
            const updatedNodes = prevNodes.map(node => {
              const normalizedNodePath = node.path.replace(/\\/g, '/');
              const fileIssues = data.issues_by_file[normalizedNodePath];

              if (fileIssues && fileIssues.length > 0) {
                console.log(`Updating node ${normalizedNodePath}: ${fileIssues.length} issues, severity will be ${getSeverityFromIssues(fileIssues)}`);
                return {
                  ...node,
                  severity: getSeverityFromIssues(fileIssues),
                  issues: fileIssues.length,
                  topIssue: fileIssues[0]?.description,
                };
              }
              // Don't mark as green yet - we don't know if this file was analyzed
              return node;
            });
            console.log("Nodes after update:", updatedNodes.filter(n => n.issues > 0));
            return updatedNodes;
          });

          setRlmProgress(prev => ({
            ...prev,
            phase: `Batch ${data.batch}/${data.total_batches} complete`,
            batch: data.batch,
            totalBatches: data.total_batches,
            issuesFound: data.total_issues || data.summary?.total_issues || 0,
            percent: 35 + (data.batch / data.total_batches) * 60,
          }));
        }

        // Handle batch failure after retries exhausted
        if (data.type === "batch_error") {
          setRlmProgress(prev => ({
            ...prev,
            phase: `Batch ${data.batch}/${data.total_batches} failed: ${data.error}`,
          }));
        }

        // Mark RLM as complete
        if (data.type === "analysis_complete") {
          // Mark all remaining gray nodes as green (analyzed, no issues found)
          setNodes(prevNodes =>
            prevNodes.map(node =>
              node.severity === "gray" ? { ...node, severity: "green", issues: 0 } : node
            )
          );

          setRlmProgress(prev => ({
            ...prev,
            phase: "Analysis complete!",
            percent: 100,
            issuesFound: data.issues_found ?? prev.issuesFound,
          }));

          setRlmInProgress(false);
          localStorage.setItem("rlmInProgress", "false");

          setTimeout(() => {
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
          }, 1000);
        }
      } catch (error) {
        console.error("Error parsing SSE data:", error);
      }
    };

    eventSourceRef.current.onerror = (error) => {
      console.error("SSE error:", error);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  };

  const filteredNodes = nodes.filter(n => {
    if (showFlagged && n.issues === 0) return false;
    if (showHighSeverity && !["red", "purple"].includes(n.severity)) return false;
    if (searchQuery && !n.path.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const fileIssues = selectedNode
    ? issuesByFile[selectedNode.path] || []
    : [];

  const handleNodeClick = async (node: FileNode) => {
    setSelectedNode(node);

    const repoName = localStorage.getItem("currentRepo");
    if (!repoName) {
      setIssuesByFile(prev => ({ ...prev, [node.path]: mockIssues.filter(i => i.file === node.path) }));
      return;
    }
    if (issuesByFile[node.path]) return;

    try {
      const issues = await getFileIssues(repoName, node.path);
      setIssuesByFile(prev => ({ ...prev, [node.path]: issues }));

      setNodes(prev =>
        prev.map(n =>
          n.id === node.id
            ? {
                ...n,
                issues: issues.length,
                severity: issues.length > 0 ? getSeverityFromIssues(issues) : "green",
                topIssue: issues[0]?.title || issues[0]?.description || n.topIssue,
              }
            : n
        )
      );
    } catch (err) {
      console.error("Failed to load file issues", err);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <AppHeader backTo="/import" backAriaLabel="Back to import" />

      {/* RLM Analysis Progress Banner */}
      {rlmInProgress && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium text-blue-400">
                {rlmProgress.phase}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-blue-400/70">
              {rlmProgress.totalBatches > 0 && (
                <span>Batch {rlmProgress.batch}/{rlmProgress.totalBatches}</span>
              )}
              {rlmProgress.issuesFound > 0 && (
                <span>{rlmProgress.issuesFound} issues found</span>
              )}
            </div>
          </div>
          <div className="w-full h-1 bg-blue-500/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${rlmProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showFlagged={showFlagged}
          onShowFlaggedChange={setShowFlagged}
          showHighSeverity={showHighSeverity}
          onShowHighSeverityChange={setShowHighSeverity}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="flex-1 relative overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm">Loading graph...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">{error}</p>
                <p className="text-xs mt-1">Showing demo data</p>
              </div>
            </div>
          ) : activeTab === "overview" && (
            <FileGraph
              nodes={filteredNodes}
              edges={edges}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNode?.id}
            />
          )}
        </div>

        <FileDetailsDrawer
          node={selectedNode}
          issues={fileIssues}
          onClose={() => setSelectedNode(null)}
        />
      </div>
    </div>
  );
};

export default Dashboard;
