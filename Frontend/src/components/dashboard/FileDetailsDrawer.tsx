import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileCode, ExternalLink, GitPullRequest, Lightbulb, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FileNode } from "@/data/mockData";
import type { Issue } from "@/data/mockData";
import type { Severity } from "@/data/types";
import CodeViewer from "./CodeViewer";

interface FileDetailsDrawerProps {
  node: FileNode | null;
  issues: Issue[];
  onClose: () => void;
}

const severityBadge: Record<Severity, string> = {
  green: "bg-severity-green/20 text-severity-green border-severity-green/30",
  yellow: "bg-severity-yellow/20 text-severity-yellow border-severity-yellow/30",
  orange: "bg-severity-orange/20 text-severity-orange border-severity-orange/30",
  red: "bg-severity-red/20 text-severity-red border-severity-red/30",
  purple: "bg-severity-purple/20 text-severity-purple border-severity-purple/30",
  gray: "bg-muted text-muted-foreground border-border",
};

const typeIcons: Record<string, string> = {
  syntax: "SYN",
  security: "SEC",
  performance: "PERF",
  style: "STY",
};

const FileDetailsDrawer = ({ node, issues, onClose }: FileDetailsDrawerProps) => {
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  if (!node) return null;

  const issuesByType = issues.reduce((acc, issue) => {
    if (!acc[issue.type]) acc[issue.type] = [];
    acc[issue.type].push(issue);
    return acc;
  }, {} as Record<string, Issue[]>);

  const errorCount = issues.filter(i => ["red", "purple"].includes(i.severity)).length;
  const warningCount = issues.filter(i => ["orange", "yellow"].includes(i.severity)).length;
  const styleCount = issues.filter(i => i.type === "style").length;

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key={node.id + (selectedIssue?.id || "")}
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 20, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-96 border-l border-border bg-card flex flex-col shrink-0 overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            {selectedIssue ? (
              <button
                onClick={() => setSelectedIssue(null)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back to file
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-primary" />
                <span className="text-sm font-mono font-medium truncate">{node.path}</span>
              </div>
            )}
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onClose}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {!selectedIssue && (
            <div className="flex items-center gap-2 mt-3">
              {errorCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-severity-red/20 text-severity-red">
                  {errorCount} error{errorCount > 1 ? "s" : ""}
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-severity-orange/20 text-severity-orange">
                  {warningCount} warning{warningCount > 1 ? "s" : ""}
                </span>
              )}
              {styleCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {styleCount} style
                </span>
              )}
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${severityBadge[node.severity]}`}>
                {node.severity === "green" ? "Clean" :
                 node.severity === "yellow" ? "Low" :
                 node.severity === "orange" ? "Medium" :
                 node.severity === "red" ? "High" :
                 node.severity === "purple" ? "Critical" : "N/A"}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedIssue ? (
            /* Code viewer for selected issue */
            <div className="p-4 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full severity-dot-${selectedIssue.severity}`} />
                  <span className="text-sm font-medium">{selectedIssue.title}</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {selectedIssue.file} · Ln {selectedIssue.line} · {selectedIssue.rule}
                </p>
              </div>

              {selectedIssue.codeSnippet && (
                <CodeViewer
                  code={selectedIssue.codeSnippet}
                  startLine={parseInt(selectedIssue.line)}
                  file={selectedIssue.file}
                />
              )}

              {selectedIssue.description && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Lightbulb className="w-3.5 h-3.5 text-severity-yellow" />
                    <span className="text-xs font-medium">Explanation</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{selectedIssue.description}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1.5 flex-1">
                  <ExternalLink className="w-3 h-3" /> Open on GitHub
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5 flex-1" disabled>
                  <GitPullRequest className="w-3 h-3" /> Create PR Fix
                </Button>
              </div>
            </div>
          ) : (
            /* Issue list grouped by type */
            <div className="p-4 space-y-4">
              {issues.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No issues found</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">This file looks clean ✓</p>
                </div>
              ) : (
                Object.entries(issuesByType).map(([type, typeIssues]) => (
                  <div key={type}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="text-primary font-mono">{typeIcons[type]}</span>
                      {type}
                      <span className="ml-auto text-muted-foreground/60">{typeIssues.length}</span>
                    </p>
                    <div className="space-y-1">
                      {typeIssues.map(issue => (
                        <button
                          key={issue.id}
                          onClick={() => setSelectedIssue(issue)}
                          className="w-full flex items-center gap-2.5 p-2.5 rounded-md hover:bg-muted/30 transition-colors text-left group"
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 severity-dot-${issue.severity}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{issue.title}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              Ln {issue.line} · {issue.rule}
                            </p>
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
};

export default FileDetailsDrawer;
