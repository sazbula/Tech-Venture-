/**
 * API Service for Contextify Backend
 *
 * Handles communication with the Python FastAPI backend for
 * repository analysis and graph data retrieval.
 */

const API_BASE = "http://localhost:8000";

// Types matching the backend response format
export interface AnalyzeResponse {
  repo_name: string;
  status: string;
  node_count: number | null;
  edge_count: number | null;
  message?: string;
}

export interface GraphNode {
  id: string;
  path: string;
  folder: string;
  severity: "green" | "yellow" | "orange" | "red" | "purple" | "gray";
  issues: number;
  topIssue?: string;
  size?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RepoInfo {
  name: string;
}

/**
 * Analyze a GitHub repository with full RLM scanning
 * @param url GitHub repository URL
 * @param force Force re-download and re-analysis
 * @param runRlm Whether to run RLM analysis (default: true)
 */
export async function analyzeRepo(
  url: string,
  force: boolean = false,
  runRlm: boolean = true
): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/analyze-full`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, force, run_rlm: runRlm }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Analysis failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get graph visualization data for a repository
 * @param repoName Name of the analyzed repository
 * @param filesOnly If true, only return file nodes (better for large repos)
 */
export async function getGraph(
  repoName: string,
  filesOnly: boolean = true
): Promise<GraphData> {
  const params = new URLSearchParams();
  if (filesOnly) params.append("files_only", "true");

  const response = await fetch(
    `${API_BASE}/graph/${encodeURIComponent(repoName)}/vis?${params}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to get graph: ${response.status}`);
  }

  return response.json();
}

/**
 * List all analyzed repositories
 */
export async function listRepos(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/repos`);

  if (!response.ok) {
    throw new Error(`Failed to list repos: ${response.status}`);
  }

  const data = await response.json();
  return data.repos || [];
}

/**
 * Check if backend is available
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate AI insights for a specific file
 */
export async function generateFileInsights(
  repoName: string,
  filePath: string
): Promise<{ insights: string; issues_count: number }> {
  const response = await fetch(`${API_BASE}/rlm/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_name: repoName, file_path: filePath }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to generate insights: ${response.status}`);
  }

  return response.json();
}

/**
 * Delete analysis data for a repository
 */
export async function deleteRepo(repoName: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/graph/${encodeURIComponent(repoName)}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to delete: ${response.status}`);
  }
}

/**
 * Analyze a local repository with full RLM scanning
 * @param repoName Name of the local repository in repos/ folder
 * @param force Force re-analysis
 * @param runRlm Whether to run RLM analysis (default: true)
 */
export async function analyzeLocalRepo(
  repoName: string,
  force: boolean = false,
  runRlm: boolean = true
): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/analyze-local`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repo_name: repoName, force, run_rlm: runRlm }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Analysis failed: ${response.status}`);
  }

  return response.json();
}

// ---------------------------
// RLM issue helpers
// ---------------------------

export type BackendIssue = {
  file?: string;
  severity?: string;
  description?: string;
  line?: number | string;
  rule?: string;
  type?: string;
  title?: string;
  code?: string;
  snippet?: string;
};

const severityFromBackend = (severity?: string): "green" | "yellow" | "orange" | "red" | "purple" => {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return "purple";
  if (s === "high") return "red";
  if (s === "medium") return "orange";
  if (s === "low") return "yellow";
  return "green";
};

/**
 * Fetch full RLM results for a repo
 */
export async function getRlmResults(repoName: string): Promise<any> {
  const response = await fetch(`${API_BASE}/rlm/results/${encodeURIComponent(repoName)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to load RLM results: ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch issues for a single file, mapped into UI Issue shape
 */
export async function getFileIssues(
  repoName: string,
  filePath: string
): Promise<import("@/data/mockData").Issue[]> {
  const results = await getRlmResults(repoName);
  const normalized = filePath.replace(/\\\\/g, "/");
  const rawIssues: BackendIssue[] =
    results?.issues_by_file?.[normalized] ||
    results?.issues_by_file?.[filePath] ||
    [];

  return rawIssues.map((issue, idx) => ({
    id: idx,
    file: normalized,
    line: String(issue.line ?? issue.rule ?? "-"),
    severity: severityFromBackend(issue.severity),
    type: (issue.type as any) || "analysis",
    title: issue.title || issue.description || "Issue",
    rule: issue.rule || issue.code || "N/A",
    status: "open",
    description: issue.description,
    codeSnippet: issue.snippet,
  }));
}
