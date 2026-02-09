import { useState } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import FileGraph from "@/components/dashboard/FileGraph";
import FileDetailsDrawer from "@/components/dashboard/FileDetailsDrawer";
import { mockNodes, mockIssues } from "@/data/mockData";
import type { FileNode } from "@/data/mockData";
import { GitBranch } from "lucide-react";

const Dashboard = () => {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [activeTab, setActiveTab] = useState("graph");
  const [showFlagged, setShowFlagged] = useState(false);
  const [showHighSeverity, setShowHighSeverity] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleNodeClick = (node: FileNode) => {
    setSelectedNode(node);
  };

  const filteredNodes = mockNodes.filter(n => {
    if (showFlagged && n.issues === 0) return false;
    if (showHighSeverity && !["red", "purple"].includes(n.severity)) return false;
    if (searchQuery && !n.path.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const fileIssues = selectedNode
    ? mockIssues.filter(i => i.file === selectedNode.path)
    : [];

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold text-sm">ContextGraph</span>
        </div>
        <div className="h-4 w-px bg-border mx-2" />
        <p className="text-xs text-muted-foreground hidden md:block">
          RLM-backed context mapping keeps long-range dependencies intact across huge repos.
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
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

        {/* Main graph area */}
        <div className="flex-1 relative overflow-hidden">
          <FileGraph
            nodes={filteredNodes}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNode?.id}
          />
        </div>

        {/* Details drawer */}
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
