import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileCode, ExternalLink, GitPullRequest, Lightbulb, ChevronRight, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FileNode } from "@/data/mockData";
import type { Issue } from "@/data/mockData";
import type { Severity } from "@/data/types";
import CodeViewer from "./CodeViewer";
import { generateFileInsights } from "@/services/api";

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
  const [issueInsights, setIssueInsights] = useState<Map<string, string>>(new Map());
  const [loadingIssueInsights, setLoadingIssueInsights] = useState<Set<string>>(new Set());
  const [insightsError, setInsightsError] = useState<string | null>(null);

  if (!node) return null;

  // Format markdown-style text from LLM
  const formatInsightText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      // Handle bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        return <div key={i} className="ml-2 mb-1">• {line.trim().substring(2)}</div>;
      }
      // Handle numbered lists
      if (/^\d+\.\s/.test(line.trim())) {
        return <div key={i} className="ml-2 mb-1">{line.trim()}</div>;
      }
      // Handle bold **text**
      const boldFormatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Handle italic *text*
      const italicFormatted = boldFormatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // Handle code `text`
      const codeFormatted = italicFormatted.replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs font-mono">$1</code>');

      if (line.trim() === '') {
        return <div key={i} className="h-2" />;
      }
      return <div key={i} dangerouslySetInnerHTML={{ __html: codeFormatted }} className="mb-1" />;
    });
  };

  const handleGenerateIssueInsights = async (issue: Issue) => {
    const repoName = localStorage.getItem("currentRepo");
    if (!repoName) return;

    setLoadingIssueInsights(prev => new Set(prev).add(issue.id));
    setInsightsError(null);

    try {
      const result = await generateFileInsights(repoName, node.path, issue.description || issue.title);
      setIssueInsights(prev => new Map(prev).set(issue.id, result.insights));
    } catch (error) {
      setInsightsError(error instanceof Error ? error.message : "Failed to generate insights");
    } finally {
      setLoadingIssueInsights(prev => {
        const next = new Set(prev);
        next.delete(issue.id);
        return next;
      });
    }
  };

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
        key={node.id}
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 20, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-96 border-l border-border bg-card flex flex-col shrink-0 overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-start justify-between mb-2 gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0 pr-2">
              <FileCode className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm font-mono font-medium break-words leading-relaxed flex-1 min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {node.path.split("/").pop() || node.path}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 -mr-1" onClick={onClose}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

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
               node.severity === "purple" ? "Critical" : "Analyzed"}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Issue list grouped by type */}
          <div className="p-4 space-y-4">
            {issues.length === 0 ? null : (
              Object.entries(issuesByType).map(([type, typeIssues]) => (
                <div key={type}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="text-primary font-mono">{typeIcons[type]}</span>
                    {type}
                    <span className="ml-auto text-muted-foreground/60">{typeIssues.length}</span>
                  </p>
                  <div className="space-y-2">
                    {typeIssues.map(issue => (
                      <div key={issue.id} className="space-y-2">
                        <div className="w-full flex items-center gap-2.5 p-2.5 rounded-md bg-muted/20 text-left">
                          <span className={`w-2 h-2 rounded-full shrink-0 severity-dot-${issue.severity}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{issue.title}</p>
                          </div>
                        </div>

                        {/* Insights for this issue */}
                        {!issueInsights.has(issue.id) ? (
                          <Button
                            onClick={() => handleGenerateIssueInsights(issue)}
                            disabled={loadingIssueInsights.has(issue.id)}
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 text-xs h-7"
                          >
                            <Sparkles className="w-3 h-3" />
                            {loadingIssueInsights.has(issue.id) ? "Generating..." : "Generate Insights"}
                          </Button>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Sparkles className="w-3 h-3 text-primary" />
                              <span className="text-xs font-medium text-primary">AI Insights</span>
                              <Button
                                onClick={() => {
                                  setIssueInsights(prev => {
                                    const next = new Map(prev);
                                    next.delete(issue.id);
                                    return next;
                                  });
                                }}
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-4 px-1 text-xs"
                              >
                                Close
                              </Button>
                            </div>
                            <div className="text-xs text-foreground/80 leading-relaxed">
                              {formatInsightText(issueInsights.get(issue.id) || '')}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            {insightsError && (
              <p className="text-xs text-destructive mt-2">{insightsError}</p>
            )}
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
};

export default FileDetailsDrawer;
