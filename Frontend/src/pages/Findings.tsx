import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, GitBranch, Download, ArrowUpDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { mockIssues } from "@/data/mockData";
import type { Severity } from "@/data/types";

const severityOrder: Record<Severity, number> = { purple: 0, red: 1, orange: 2, yellow: 3, green: 4, gray: 5 };

const severityBadgeClass: Record<Severity, string> = {
  purple: "bg-severity-purple/20 text-severity-purple",
  red: "bg-severity-red/20 text-severity-red",
  orange: "bg-severity-orange/20 text-severity-orange",
  yellow: "bg-severity-yellow/20 text-severity-yellow",
  green: "bg-severity-green/20 text-severity-green",
  gray: "bg-muted text-muted-foreground",
};

const Findings = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"severity" | "file" | "type">("severity");
  const [filterType, setFilterType] = useState<string>("all");

  const types = useMemo(() => ["all", ...new Set(mockIssues.map(i => i.type))], []);

  const filteredIssues = useMemo(() => {
    let issues = [...mockIssues];
    if (search) {
      const q = search.toLowerCase();
      issues = issues.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.file.toLowerCase().includes(q) ||
        i.rule.toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") {
      issues = issues.filter(i => i.type === filterType);
    }
    issues.sort((a, b) => {
      if (sortBy === "severity") return severityOrder[a.severity] - severityOrder[b.severity];
      if (sortBy === "file") return a.file.localeCompare(b.file);
      return a.type.localeCompare(b.type);
    });
    return issues;
  }, [search, sortBy, filterType]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold text-sm">ContextGraph</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-sm text-muted-foreground">Findings</span>
        <span className="ml-auto text-xs text-muted-foreground">{filteredIssues.length} issues</span>
      </header>

      <div className="p-6 space-y-4 max-w-7xl mx-auto w-full">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search issues..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 h-9 bg-card border-border text-sm"
          />
          <div className="flex items-center gap-1">
            {types.map(t => (
              <Button
                key={t}
                variant={filterType === t ? "default" : "ghost"}
                size="sm"
                className="text-xs capitalize h-8"
                onClick={() => setFilterType(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setSortBy(s => s === "severity" ? "file" : s === "file" ? "type" : "severity")}>
              <ArrowUpDown className="w-3 h-3" /> Sort: {sortBy}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <Download className="w-3 h-3" /> Export
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Severity</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Type</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Message</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">File</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Line</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Rule</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.map((issue, i) => (
                <motion.tr
                  key={issue.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-border/50 hover:bg-card/50 transition-colors cursor-pointer"
                >
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityBadgeClass[issue.severity]}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground capitalize">{issue.type}</td>
                  <td className="p-3 text-foreground">{issue.title}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{issue.file}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{issue.line}</td>
                  <td className="p-3 font-mono text-xs text-primary/70">{issue.rule}</td>
                  <td className="p-3">
                    <span className="text-xs text-severity-yellow">{issue.status}</span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Findings;
