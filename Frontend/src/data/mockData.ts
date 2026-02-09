import { Severity } from "./types";

export interface FileNode {
  id: string;
  path: string;
  folder: string;
  x: number;
  y: number;
  severity: Severity;
  issues: number;
  topIssue?: string;
  size?: number;
}

export interface Edge {
  from: string;
  to: string;
}

export interface Issue {
  id: number;
  file: string;
  line: string;
  severity: Severity;
  type: "syntax" | "security" | "performance" | "style";
  title: string;
  rule: string;
  status: "open" | "resolved" | "ignored";
  description?: string;
  codeSnippet?: string;
}

export const mockNodes: FileNode[] = [
  // Core cluster (center)
  { id: "n1", path: "src/index.ts", folder: "src", x: 400, y: 300, severity: "green", issues: 0, size: 14 },
  { id: "n2", path: "src/app.ts", folder: "src", x: 340, y: 230, severity: "green", issues: 0, size: 16 },
  { id: "n3", path: "src/config.ts", folder: "src", x: 470, y: 240, severity: "yellow", issues: 2, topIssue: "Unused config keys", size: 12 },
  { id: "n4", path: "src/types.ts", folder: "src", x: 500, y: 340, severity: "green", issues: 0, size: 10 },
  
  // Auth cluster (top-left)
  { id: "n5", path: "src/auth/handler.ts", folder: "src/auth", x: 180, y: 140, severity: "red", issues: 5, topIssue: "Unvalidated input", size: 18 },
  { id: "n6", path: "src/auth/middleware.ts", folder: "src/auth", x: 120, y: 220, severity: "orange", issues: 3, topIssue: "Missing rate limit", size: 14 },
  { id: "n7", path: "src/auth/session.ts", folder: "src/auth", x: 220, y: 280, severity: "yellow", issues: 1, topIssue: "Session expiry too long", size: 12 },
  { id: "n8", path: "src/auth/oauth.ts", folder: "src/auth", x: 80, y: 310, severity: "purple", issues: 7, topIssue: "Token leak via logs", size: 20 },
  
  // API cluster (right)
  { id: "n9", path: "src/api/routes.ts", folder: "src/api", x: 620, y: 180, severity: "green", issues: 0, size: 16 },
  { id: "n10", path: "src/api/users.ts", folder: "src/api", x: 700, y: 260, severity: "yellow", issues: 2, topIssue: "N+1 query", size: 14 },
  { id: "n11", path: "src/api/posts.ts", folder: "src/api", x: 680, y: 360, severity: "green", issues: 0, size: 12 },
  { id: "n12", path: "src/api/upload.ts", folder: "src/api", x: 750, y: 180, severity: "red", issues: 4, topIssue: "No file type validation", size: 16 },
  
  // DB cluster (bottom-left)
  { id: "n13", path: "src/db/connection.ts", folder: "src/db", x: 160, y: 420, severity: "green", issues: 0, size: 14 },
  { id: "n14", path: "src/db/migrations.ts", folder: "src/db", x: 100, y: 500, severity: "yellow", issues: 1, topIssue: "Missing rollback", size: 12 },
  { id: "n15", path: "src/db/models.ts", folder: "src/db", x: 240, y: 480, severity: "green", issues: 0, size: 16 },
  { id: "n16", path: "src/db/queries.ts", folder: "src/db", x: 300, y: 420, severity: "orange", issues: 3, topIssue: "SQL injection risk", size: 14 },
  
  // Utils cluster (bottom-right)
  { id: "n17", path: "src/utils/logger.ts", folder: "src/utils", x: 540, y: 460, severity: "green", issues: 0, size: 10 },
  { id: "n18", path: "src/utils/crypto.ts", folder: "src/utils", x: 620, y: 500, severity: "orange", issues: 2, topIssue: "Weak hash algo", size: 12 },
  { id: "n19", path: "src/utils/helpers.ts", folder: "src/utils", x: 480, y: 520, severity: "green", issues: 0, size: 10 },
  { id: "n20", path: "src/utils/validators.ts", folder: "src/utils", x: 570, y: 560, severity: "yellow", issues: 1, topIssue: "Incomplete email regex", size: 12 },
  
  // Tests cluster (top-right)
  { id: "n21", path: "tests/auth.test.ts", folder: "tests", x: 750, y: 80, severity: "gray", issues: 0, size: 10 },
  { id: "n22", path: "tests/api.test.ts", folder: "tests", x: 820, y: 140, severity: "gray", issues: 0, size: 10 },
  { id: "n23", path: "tests/db.test.ts", folder: "tests", x: 780, y: 220, severity: "gray", issues: 0, size: 8 },
  
  // Config files (scattered)
  { id: "n24", path: "package.json", folder: "root", x: 60, y: 60, severity: "green", issues: 0, size: 10 },
  { id: "n25", path: "tsconfig.json", folder: "root", x: 140, y: 50, severity: "green", issues: 0, size: 8 },
  { id: "n26", path: ".env", folder: "root", x: 40, y: 140, severity: "red", issues: 1, topIssue: "Hardcoded secret", size: 10 },
  
  // More files
  { id: "n27", path: "src/middleware/cors.ts", folder: "src/middleware", x: 380, y: 130, severity: "green", issues: 0, size: 10 },
  { id: "n28", path: "src/middleware/auth.ts", folder: "src/middleware", x: 460, y: 100, severity: "yellow", issues: 1, topIssue: "Missing CSRF check", size: 12 },
  { id: "n29", path: "src/services/email.ts", folder: "src/services", x: 550, y: 100, severity: "green", issues: 0, size: 12 },
  { id: "n30", path: "src/services/cache.ts", folder: "src/services", x: 350, y: 520, severity: "green", issues: 0, size: 10 },
];

export const mockEdges: Edge[] = [
  { from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n2", to: "n4" },
  { from: "n2", to: "n5" }, { from: "n5", to: "n6" }, { from: "n5", to: "n7" },
  { from: "n6", to: "n8" }, { from: "n2", to: "n9" }, { from: "n9", to: "n10" },
  { from: "n9", to: "n11" }, { from: "n9", to: "n12" }, { from: "n2", to: "n13" },
  { from: "n13", to: "n14" }, { from: "n13", to: "n15" }, { from: "n15", to: "n16" },
  { from: "n1", to: "n17" }, { from: "n17", to: "n18" }, { from: "n17", to: "n19" },
  { from: "n19", to: "n20" }, { from: "n5", to: "n21" }, { from: "n9", to: "n22" },
  { from: "n13", to: "n23" }, { from: "n7", to: "n28" }, { from: "n27", to: "n28" },
  { from: "n10", to: "n16" }, { from: "n6", to: "n18" }, { from: "n29", to: "n10" },
  { from: "n15", to: "n30" },
];

export const mockIssues: Issue[] = [
  { id: 1, file: "src/auth/handler.ts", line: "84–92", severity: "red", type: "security", title: "Unvalidated user input in auth handler", rule: "SEC-001", status: "open",
    description: "User input from request body is passed directly to database query without sanitization.",
    codeSnippet: `const user = req.body.user;\nconst result = await db.query(\`SELECT * FROM users WHERE name = '\${user}'\`);\n// This allows SQL injection attacks\nreturn result.rows[0];` },
  { id: 2, file: "src/auth/handler.ts", line: "105–108", severity: "orange", type: "security", title: "Missing input length validation", rule: "SEC-003", status: "open" },
  { id: 3, file: "src/auth/handler.ts", line: "120–125", severity: "yellow", type: "performance", title: "Redundant database call in loop", rule: "PERF-002", status: "open" },
  { id: 4, file: "src/auth/handler.ts", line: "45–48", severity: "yellow", type: "style", title: "Inconsistent error handling pattern", rule: "STYLE-011", status: "open" },
  { id: 5, file: "src/auth/handler.ts", line: "200–210", severity: "red", type: "security", title: "Plaintext password comparison", rule: "SEC-007", status: "open",
    codeSnippet: `if (password === storedPassword) {\n  // WARNING: comparing plaintext passwords\n  return { authenticated: true };\n}` },
  { id: 6, file: "src/auth/middleware.ts", line: "30–38", severity: "orange", type: "security", title: "Missing rate limiting on auth endpoint", rule: "SEC-012", status: "open" },
  { id: 7, file: "src/auth/middleware.ts", line: "55–60", severity: "yellow", type: "performance", title: "Synchronous token verification", rule: "PERF-005", status: "open" },
  { id: 8, file: "src/auth/middleware.ts", line: "72–75", severity: "orange", type: "style", title: "Catch block swallows errors silently", rule: "STYLE-003", status: "open" },
  { id: 9, file: "src/auth/oauth.ts", line: "15–22", severity: "purple", type: "security", title: "OAuth token logged to stdout", rule: "SEC-020", status: "open",
    codeSnippet: `console.log('OAuth token received:', token);\n// CRITICAL: tokens should never be logged\n// This exposes credentials in log aggregation systems` },
  { id: 10, file: "src/auth/oauth.ts", line: "40–55", severity: "red", type: "security", title: "No token expiry validation", rule: "SEC-021", status: "open" },
  { id: 11, file: "src/auth/oauth.ts", line: "60–68", severity: "red", type: "security", title: "PKCE not implemented", rule: "SEC-022", status: "open" },
  { id: 12, file: "src/auth/oauth.ts", line: "80–85", severity: "orange", type: "security", title: "Redirect URI not validated", rule: "SEC-023", status: "open" },
  { id: 13, file: "src/auth/oauth.ts", line: "100–105", severity: "orange", type: "performance", title: "Token refresh runs synchronously", rule: "PERF-008", status: "open" },
  { id: 14, file: "src/auth/oauth.ts", line: "110–115", severity: "yellow", type: "style", title: "Magic strings for OAuth scopes", rule: "STYLE-015", status: "open" },
  { id: 15, file: "src/auth/oauth.ts", line: "120–125", severity: "yellow", type: "syntax", title: "Unreachable code after return", rule: "SYN-002", status: "open" },
  { id: 16, file: "src/api/upload.ts", line: "25–35", severity: "red", type: "security", title: "No file type validation on upload", rule: "SEC-030", status: "open",
    codeSnippet: `const file = req.files[0];\n// No validation of file type or size\nawait storage.save(file.buffer, file.originalname);` },
  { id: 17, file: "src/api/upload.ts", line: "40–45", severity: "red", type: "security", title: "Path traversal vulnerability", rule: "SEC-031", status: "open" },
  { id: 18, file: "src/api/upload.ts", line: "55–60", severity: "orange", type: "performance", title: "No file size limit enforced", rule: "PERF-010", status: "open" },
  { id: 19, file: "src/api/upload.ts", line: "70–72", severity: "yellow", type: "style", title: "Missing error response body", rule: "STYLE-020", status: "open" },
  { id: 20, file: "src/api/users.ts", line: "18–28", severity: "yellow", type: "performance", title: "N+1 query in user listing", rule: "PERF-001", status: "open" },
  { id: 21, file: "src/api/users.ts", line: "35–40", severity: "yellow", type: "style", title: "Response not paginated", rule: "STYLE-025", status: "open" },
  { id: 22, file: "src/db/queries.ts", line: "12–20", severity: "red", type: "security", title: "Raw SQL with string interpolation", rule: "SEC-040", status: "open",
    codeSnippet: `export function findUser(name: string) {\n  return db.raw(\`SELECT * FROM users WHERE name = '\${name}'\`);\n  // Use parameterized queries instead\n}` },
  { id: 23, file: "src/db/queries.ts", line: "30–35", severity: "orange", type: "performance", title: "Missing index hint for large table scan", rule: "PERF-015", status: "open" },
  { id: 24, file: "src/db/queries.ts", line: "45–48", severity: "yellow", type: "style", title: "Inconsistent query naming convention", rule: "STYLE-030", status: "open" },
  { id: 25, file: "src/utils/crypto.ts", line: "8–12", severity: "orange", type: "security", title: "Using MD5 for password hashing", rule: "SEC-050", status: "open",
    codeSnippet: `import { createHash } from 'crypto';\nexport const hashPassword = (pwd: string) =>\n  createHash('md5').update(pwd).digest('hex');\n// MD5 is cryptographically broken` },
  { id: 26, file: "src/utils/crypto.ts", line: "20–25", severity: "orange", type: "security", title: "Predictable random number generation", rule: "SEC-051", status: "open" },
  { id: 27, file: "src/config.ts", line: "15–18", severity: "yellow", type: "style", title: "Unused configuration keys", rule: "STYLE-001", status: "open" },
  { id: 28, file: "src/config.ts", line: "22–25", severity: "yellow", type: "style", title: "Default values should use env vars", rule: "STYLE-002", status: "open" },
  { id: 29, file: "src/auth/session.ts", line: "40–45", severity: "yellow", type: "security", title: "Session expiry set to 30 days", rule: "SEC-060", status: "open" },
  { id: 30, file: ".env", line: "3", severity: "red", type: "security", title: "Hardcoded API secret in .env committed to repo", rule: "SEC-100", status: "open",
    codeSnippet: `DATABASE_URL=postgres://admin:password123@db.example.com/prod\nAPI_SECRET=sk_live_abc123def456\n# These should be in a secrets manager` },
  { id: 31, file: "src/middleware/auth.ts", line: "15–20", severity: "yellow", type: "security", title: "Missing CSRF token validation", rule: "SEC-070", status: "open" },
  { id: 32, file: "src/db/migrations.ts", line: "30–35", severity: "yellow", type: "syntax", title: "Missing rollback function in migration", rule: "SYN-010", status: "open" },
  { id: 33, file: "src/utils/validators.ts", line: "10–12", severity: "yellow", type: "syntax", title: "Incomplete email regex pattern", rule: "SYN-015", status: "open" },
];

export const severityCounts = {
  green: mockNodes.filter(n => n.severity === "green").length,
  yellow: mockNodes.filter(n => n.severity === "yellow").length,
  orange: mockNodes.filter(n => n.severity === "orange").length,
  red: mockNodes.filter(n => n.severity === "red").length,
  purple: mockNodes.filter(n => n.severity === "purple").length,
  gray: mockNodes.filter(n => n.severity === "gray").length,
};
