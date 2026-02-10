import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, GitBranch, Download, ArrowUpDown, Filter, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { mockIssues } from "@/data/mockData";
import type { Severity } from "@/data/types";
import type { Issue } from "@/data/mockData";
import { generateFileInsights } from "@/services/api";

const severityOrder: Record<Severity, number> = { purple: 0, red: 1, orange: 2, yellow: 3, green: 4, gray: 5 };

// Map RLM severity levels to UI colors
const mapSeverityToColor = (severity: string): Severity => {
  const severityLower = severity.toLowerCase();
  if (severityLower === "critical") return "purple";
  if (severityLower === "high") return "red";
  if (severityLower === "medium") return "orange";
  if (severityLower === "low") return "yellow";
  if (severityLower === "none") return "green";
  // If already a color, return it
  if (["purple", "red", "orange", "yellow", "green", "gray"].includes(severityLower)) {
    return severityLower as Severity;
  }
  return "gray";
};

const severityBadgeClass: Record<Severity, string> = {
  purple: "bg-severity-purple/20 text-severity-purple",
  red: "bg-severity-red/20 text-severity-red",
  orange: "bg-severity-orange/20 text-severity-orange",
  yellow: "bg-severity-yellow/20 text-severity-yellow",
  green: "bg-severity-green/20 text-severity-green",
  gray: "bg-muted text-muted-foreground",
};

const typeBadgeClass: Record<string, string> = {
  security: "bg-red-500/10 text-red-400",
  performance: "bg-blue-500/10 text-blue-400",
  syntax: "bg-purple-500/10 text-purple-400",
  style: "bg-yellow-500/10 text-yellow-400",
  other: "bg-muted text-muted-foreground",
};

const Findings = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"severity" | "file" | "type">("severity");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterFile, setFilterFile] = useState<string>("all");
  const [issues, setIssues] = useState<Issue[]>(mockIssues);
  const [loading, setLoading] = useState(true);
  const [repoName, setRepoName] = useState<string>("Demo");
  const [issueInsights, setIssueInsights] = useState<Map<string, string>>(new Map());
  const [loadingIssueInsights, setLoadingIssueInsights] = useState<Set<string>>(new Set());
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  // Load issues from API
  useEffect(() => {
    const loadIssues = async () => {
      const currentRepo = localStorage.getItem("currentRepo");

      if (!currentRepo) {
        // No repo selected, use mock data
        setIssues(mockIssues);
        setRepoName("Demo");
        setLoading(false);
        return;
      }

      setRepoName(currentRepo);
      setLoading(true);

      try {
        // Fetch all issues for the repo from the RLM analysis results
        const response = await fetch(`http://localhost:8000/rlm/results/${currentRepo}`);
        if (!response.ok) throw new Error("Failed to load repo data");

        const data = await response.json();

        // Collect all issues from all files
        const allIssues: Issue[] = [];
        if (data.issues_by_file) {
          Object.entries(data.issues_by_file).forEach(([filePath, fileIssues]: [string, any[]]) => {
            fileIssues.forEach((issue, idx) => {
              // Skip "none" severity issues - they're just markers that the file was analyzed
              if (issue.severity === "none") return;
              
              allIssues.push({
                id: `${filePath}-${idx}`,
                file: filePath,
                line: issue.line_number?.toString() || "N/A",
                severity: issue.severity as Severity,
                type: issue.category || "other",
                title: issue.description || issue.title || "No description",
                description: issue.description || "",
                rule: issue.rule || "unknown",
                status: "open",
              });
            });
          });
        }

        setIssues(allIssues.length > 0 ? allIssues : mockIssues);
      } catch (error) {
        console.error("Failed to load issues:", error);
        setIssues(mockIssues);
      } finally {
        setLoading(false);
      }
    };

    loadIssues();
  }, []);

  const types = useMemo(() => ["all", ...new Set(issues.map(i => i.type))], [issues]);
  const severities = useMemo(() => ["all", "critical", "high", "medium", "low", "none"], []);
  const files = useMemo(() => ["all", ...new Set(issues.map(i => i.file.split('/').pop() || i.file))], [issues]);

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
    if (!repoName || repoName === "Demo") return;

    setLoadingIssueInsights(prev => new Set(prev).add(issue.id));
    setInsightsError(null);

    try {
      const result = await generateFileInsights(repoName, issue.file, issue.description || issue.title);
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

  const filteredIssues = useMemo(() => {
    let filtered = [...issues];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.file.toLowerCase().includes(q) ||
        i.rule.toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") {
      filtered = filtered.filter(i => i.type === filterType);
    }
    if (filterSeverity !== "all") {
      filtered = filtered.filter(i => i.severity.toLowerCase() === filterSeverity.toLowerCase());
    }
    if (filterFile !== "all") {
      filtered = filtered.filter(i => i.file.split('/').pop() === filterFile);
    }
    filtered.sort((a, b) => {
      if (sortBy === "severity") return severityOrder[mapSeverityToColor(a.severity)] - severityOrder[mapSeverityToColor(b.severity)];
      if (sortBy === "file") return a.file.localeCompare(b.file);
      return a.type.localeCompare(b.type);
    });
    return filtered;
  }, [issues, search, sortBy, filterType, filterSeverity, filterFile]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold text-sm">{repoName}</span>
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
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Type:</span>
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
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Severity:</span>
            {severities.map(s => (
              <Button
                key={s}
                variant={filterSeverity === s ? "default" : "ghost"}
                size="sm"
                className="text-xs capitalize h-8"
                onClick={() => setFilterSeverity(s)}
              >
                {s}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 max-w-xs">
            <span className="text-xs text-muted-foreground">File:</span>
            <select
              value={filterFile}
              onChange={e => setFilterFile(e.target.value)}
              className="h-8 px-2 text-xs bg-card border border-border rounded-md"
            >
              {files.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
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
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Loading issues...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredIssues.map((issue, i) => (
              <motion.div
                key={issue.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="border border-border rounded-lg overflow-hidden bg-card"
              >
                <div className="p-4 hover:bg-card/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityBadgeClass[mapSeverityToColor(issue.severity)]} shrink-0`}>
                      {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                    </span>
                    {issue.type !== "other" && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeBadgeClass[issue.type] || typeBadgeClass.other} shrink-0`}>
                        {issue.type.charAt(0).toUpperCase() + issue.type.slice(1)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground truncate">
                          {issue.file.split('/').pop()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{issue.title}</p>
                    </div>
                    <Button
                      onClick={() => {
                        if (expandedIssue === issue.id) {
                          setExpandedIssue(null);
                        } else {
                          setExpandedIssue(issue.id);
                          if (!issueInsights.has(issue.id) && repoName !== "Demo") {
                            handleGenerateIssueInsights(issue);
                          }
                        }
                      }}
                      disabled={loadingIssueInsights.has(issue.id) || (repoName === "Demo" && !issueInsights.has(issue.id))}
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs h-8 shrink-0"
                    >
                      <Sparkles className="w-3 h-3" />
                      {loadingIssueInsights.has(issue.id)
                        ? "Generating..."
                        : expandedIssue === issue.id && issueInsights.has(issue.id)
                        ? "Hide Insights"
                        : repoName === "Demo"
                        ? "Demo only"
                        : "Generate Insights"}
                    </Button>
                  </div>
                </div>

                {/* Expanded insights section */}
                {expandedIssue === issue.id && issueInsights.has(issue.id) && (
                  <div className="border-t border-border p-4 bg-muted/20">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3 h-3 text-primary" />
                        <span className="text-xs font-medium text-primary">AI Insights</span>
                      </div>
                      <div className="text-xs text-foreground/80 leading-relaxed bg-primary/5 border border-primary/20 rounded p-3">
                        {formatInsightText(issueInsights.get(issue.id) || '')}
                      </div>
                    </div>
                    {insightsError && (
                      <p className="text-xs text-destructive mt-2">{insightsError}</p>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Findings;
