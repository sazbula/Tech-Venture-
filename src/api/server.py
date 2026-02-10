"""
Contextify REST API Server

FastAPI server exposing repository analysis endpoints.

Run with:
    uvicorn src.api.server:app --reload

Or:
    python -m src.api.server
"""

import sys
from pathlib import Path

# Add parent dirs for imports
REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from typing import Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor

from pipeline import ContextifyPipeline, AnalysisResult
from api.graph_api import GraphAPI, load_graph
from github_fetch import GitHubFetchError

# Initialize FastAPI app
app = FastAPI(
    title="Contextify API",
    description="Repository analysis API for AI-powered code understanding",
    version="0.1.0",
)

# Enable CORS for web UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize pipeline
pipeline = ContextifyPipeline()

# Thread pool for running blocking operations
executor = ThreadPoolExecutor(max_workers=4)

# Track analysis jobs
analysis_jobs: dict[str, dict] = {}


# Request/Response models
class AnalyzeRequest(BaseModel):
    url: str
    force: bool = False


class AnalyzeResponse(BaseModel):
    repo_name: str
    status: str
    node_count: Optional[int] = None
    edge_count: Optional[int] = None
    message: Optional[str] = None


class GraphResponse(BaseModel):
    nodes: list[dict]
    edges: list[dict]
    files: list[str]
    stats: dict


class SearchRequest(BaseModel):
    query: str
    exact: bool = False


class NodeResponse(BaseModel):
    id: str
    name: str
    category: str
    kind: str
    file: str
    line: list[int]
    info: str


# API Endpoints

@app.get("/")
async def root():
    """API health check."""
    return {"status": "ok", "service": "Contextify API"}


@app.get("/repos")
async def list_repos():
    """List all analyzed repositories."""
    repos = pipeline.list_analyzed_repos()
    return {"repos": repos}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_repo(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Analyze a GitHub repository.

    This endpoint triggers analysis and returns immediately.
    For large repos, the analysis runs in the background.
    """
    try:
        # Run analysis in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            lambda: pipeline.analyze(
                request.url,
                force_download=request.force,
                force_analyze=request.force
            )
        )

        return AnalyzeResponse(
            repo_name=result.repo_name,
            status="completed",
            node_count=result.node_count,
            edge_count=result.edge_count,
        )

    except GitHubFetchError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/graph/{repo_name}", response_model=GraphResponse)
async def get_graph(repo_name: str):
    """Get the full graph data for a repository."""
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        return api.to_json()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.get("/graph/{repo_name}/vis")
async def get_graph_vis(repo_name: str, files_only: bool = False):
    """Get graph data in visualization-friendly format.

    Args:
        files_only: If true, only return file nodes (better for large repos)
    """
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        return api.to_vis_format(files_only=files_only)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.get("/graph/{repo_name}/nodes")
async def get_nodes(
    repo_name: str,
    kind: Optional[str] = None,
    category: Optional[str] = None
):
    """Get all nodes, optionally filtered by kind or category."""
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        nodes = api.get_nodes(kind=kind, category=category)
        return {"nodes": [n.to_dict() for n in nodes]}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.get("/graph/{repo_name}/edges")
async def get_edges(repo_name: str):
    """Get all edges in the graph."""
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        edges = api.get_edges()
        return {"edges": [e.to_dict() for e in edges]}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.get("/graph/{repo_name}/node/{node_name}")
async def get_node(repo_name: str, node_name: str):
    """Get a specific node by name."""
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        node = api.get_node(node_name)
        if not node:
            raise HTTPException(status_code=404, detail=f"Node not found: {node_name}")
        return node.to_dict()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.get("/graph/{repo_name}/node/{node_name}/neighbors")
async def get_neighbors(repo_name: str, node_name: str, depth: int = 1):
    """Get neighbors of a node."""
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        neighbors = api.get_neighbors(node_name, depth=depth)
        return {"neighbors": neighbors}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.post("/graph/{repo_name}/search")
async def search_graph(repo_name: str, request: SearchRequest):
    """Search for nodes by name."""
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        results = api.search(request.query, exact=request.exact)
        return {"results": [n.to_dict() for n in results]}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.get("/graph/{repo_name}/files")
async def get_files(repo_name: str):
    """Get list of files in the repository."""
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        files = api.get_files()
        return {"files": files}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.get("/graph/{repo_name}/file/{file_path:path}")
async def get_file_nodes(repo_name: str, file_path: str):
    """Get all nodes in a specific file."""
    try:
        api = load_graph(pipeline.output_dir / repo_name)
        nodes = api.get_file_nodes(file_path)
        return {"nodes": [n.to_dict() for n in nodes]}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


@app.delete("/graph/{repo_name}")
async def delete_graph(repo_name: str):
    """Delete analysis data for a repository."""
    if pipeline.delete_analysis(repo_name):
        return {"status": "deleted", "repo_name": repo_name}
    raise HTTPException(status_code=404, detail=f"Repository not found: {repo_name}")


# Run with: python -m src.api.server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
