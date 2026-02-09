import { Search, GitBranch, ChevronDown, LayoutGrid, Network, AlertTriangle, Settings, Flag, AlertOctagon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  showFlagged: boolean;
  onShowFlaggedChange: (v: boolean) => void;
  showHighSeverity: boolean;
  onShowHighSeverityChange: (v: boolean) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const tabs = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "graph", label: "File Graph", icon: Network },
  { id: "findings", label: "Findings", icon: AlertTriangle },
  { id: "settings", label: "Settings", icon: Settings },
];

const DashboardSidebar = ({
  activeTab,
  onTabChange,
  showFlagged,
  onShowFlaggedChange,
  showHighSeverity,
  onShowHighSeverityChange,
  searchQuery,
  onSearchChange,
}: DashboardSidebarProps) => {
  const navigate = useNavigate();

  const handleTabClick = (id: string) => {
    if (id === "findings") {
      navigate("/findings");
      return;
    }
    onTabChange(id);
  };

  return (
    <aside className="w-60 border-r border-border bg-card flex flex-col shrink-0">
      {/* Repo info */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-medium font-mono truncate">acme/backend-api</span>
        </div>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <span className="px-1.5 py-0.5 rounded bg-muted text-xs">main</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Tabs */}
      <nav className="p-2 space-y-0.5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Filters */}
      <div className="px-4 py-3 border-t border-border space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Filters</p>
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Flag className="w-3.5 h-3.5" />
            Flagged files
          </div>
          <Switch checked={showFlagged} onCheckedChange={onShowFlaggedChange} />
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <AlertOctagon className="w-3.5 h-3.5" />
            High severity
          </div>
          <Switch checked={showHighSeverity} onCheckedChange={onShowHighSeverityChange} />
        </label>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-t border-border mt-auto">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search file/function…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs bg-background border-border"
          />
        </div>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
