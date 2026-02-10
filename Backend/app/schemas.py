from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl

Severity = Literal["green", "yellow", "orange", "red", "purple", "gray"]
IssueType = Literal["syntax", "security", "performance", "style"]
Status = Literal["queued", "running", "done", "failed"]


class AnalyzeRequest(BaseModel):
    url: HttpUrl = Field(..., description="GitHub repository URL")
    force: bool = False
    demo: bool | None = None


class AnalyzeResponse(BaseModel):
    review_id: str
    repo_name: str
    status: Status
    node_count: int | None = None
    edge_count: int | None = None
    message: Optional[str] = None


class GraphNode(BaseModel):
    id: str
    path: str
    folder: str
    severity: Severity
    issues: int
    topIssue: Optional[str] = None
    size: Optional[int] = None


class GraphEdge(BaseModel):
    from_: str = Field(..., alias="from")
    to: str

    class Config:
        populate_by_name = True


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    severity_counts: Optional[dict[str, int]] = None


class Issue(BaseModel):
    id: int
    file: str
    line: str
    severity: Severity
    type: IssueType
    title: str
    rule: str
    status: Literal["open", "resolved", "ignored"] = "open"
    description: Optional[str] = None
    codeSnippet: Optional[str] = None


class IssuesResponse(BaseModel):
    issues: list[Issue]


class HealthResponse(BaseModel):
    status: str = "ok"


class ErrorResponse(BaseModel):
    detail: str
