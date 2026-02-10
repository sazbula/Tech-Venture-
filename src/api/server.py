"""
Contextify REST API Server

FastAPI server exposing repository analysis endpoints.

Run with:
    uvicorn src.api.server:app --reload

Or:
    python -m src.api.server
"""

import sys
import json
import os
import time
from pathlib import Path

# Disable stdout buffering for real-time logging
os.environ['PYTHONUNBUFFERED'] = '1'
sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None

# Add parent dirs for imports
REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from typing import Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor

from pipeline import ContextifyPipeline, AnalysisResult
from api.graph_api import GraphAPI, load_graph
from github_fetch import GitHubFetchError

# Import RLM scanner
try:
    from rlm_scanner import EnhancedRLMScanner
    RLM_AVAILABLE = True
except ImportError:
    RLM_AVAILABLE = False
    print("Warning: RLM scanner not available (missing dependencies)")

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

# Track analysis jobs and progress (list of events per repo, not single value)
analysis_jobs: dict[str, dict] = {}
analysis_events: dict[str, list[dict]] = {}


def emit_progress(repo_name: str, data: dict):
    """Append a progress event to the repo's event list. Thread-safe for use from callbacks."""
    print(f"[PROGRESS] {data.get('type')}: {data}")
    if repo_name not in analysis_events:
        analysis_events[repo_name] = []
    analysis_events[repo_name].append({
        "timestamp": time.time(),
        "data": data,
    })


# Progress callback for RLM scanner
def progress_callback(data: dict):
    """Store progress updates for real-time tracking"""
    repo_name = data.get("repo_name", "unknown")
    emit_progress(repo_name, data)


# Initialize RLM scanner if available
rlm_scanner = None
if RLM_AVAILABLE:
    try:
        rlm_scanner = EnhancedRLMScanner(
            max_iterations=5,
            output_dir=str(pipeline.output_dir),
            repos_dir=str(pipeline.repos_dir),
            progress_callback=progress_callback
        )
        print("✓ RLM scanner initialized with verbose logging")
    except Exception as e:
        print(f"Warning: Failed to initialize RLM scanner: {e}")
        RLM_AVAILABLE = False

# Thread pool for running blocking operations
executor = ThreadPoolExecutor(max_workers=4)


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


class RLMScanRequest(BaseModel):
    url: str
    force: bool = False


class RLMScanResponse(BaseModel):
    repo_name: str
    status: str
    files_analyzed: Optional[int] = None
    issues_found: Optional[int] = None
    execution_time: Optional[float] = None
    message: Optional[str] = None


class FullAnalysisRequest(BaseModel):
    url: str
    force: bool = False
    run_rlm: bool = True  # Run RLM analysis by default


class FullAnalysisResponse(BaseModel):
    repo_name: str
    status: str
    graph_analysis: dict
    rlm_analysis: Optional[dict] = None


class LocalAnalysisRequest(BaseModel):
    repo_name: str  # Name of folder in repos/ directory
    force: bool = False
    run_rlm: bool = True


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


# RLM Scanning Endpoints

@app.post("/rlm/scan", response_model=RLMScanResponse)
async def rlm_scan_repo(request: RLMScanRequest):
    """
    Perform RLM-based code analysis on a GitHub repository.

    This endpoint downloads the repo (if needed), builds the graph,
    and runs RLM analysis to detect issues.
    """
    if not RLM_AVAILABLE or not rlm_scanner:
        raise HTTPException(
            status_code=503,
            detail="RLM scanner not available. Check OPENAI_API_KEY and dependencies."
        )

    try:
        # Run RLM scan in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            lambda: rlm_scanner.scan_github_repo(
                request.url,
                force_download=request.force,
                force_analyze=request.force
            )
        )

        from github_fetch import parse_github_url
        _, repo_name = parse_github_url(request.url)

        return RLMScanResponse(
            repo_name=repo_name,
            status="completed",
            files_analyzed=result.get("files_analyzed"),
            issues_found=result.get("issues_found"),
            execution_time=result.get("execution_time"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RLM scan failed: {str(e)}")


@app.get("/rlm/results/{repo_name}")
async def get_rlm_results(repo_name: str):
    """Get RLM analysis results for a repository."""
    from pathlib import Path

    results_path = Path("analysis") / repo_name / "detailed_analysis.json"

    if not results_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No RLM results found for: {repo_name}"
        )

    try:
        with open(results_path, 'r', encoding='utf-8') as f:
            results = json.load(f)
        return results
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read results: {str(e)}"
        )


@app.get("/rlm/status")
async def rlm_status():
    """Check if RLM scanning is available."""
    return {
        "available": RLM_AVAILABLE and rlm_scanner is not None,
        "message": "RLM scanning ready" if RLM_AVAILABLE else "RLM scanner not configured"
    }


@app.get("/rlm/progress/{repo_name}")
async def get_rlm_progress(repo_name: str):
    """Get real-time progress for an ongoing RLM analysis."""
    if repo_name in analysis_events and analysis_events[repo_name]:
        latest = analysis_events[repo_name][-1]
        return latest
    return {"status": "not_found", "message": "No progress data available"}


@app.get("/rlm/stream/{repo_name}")
async def stream_rlm_progress(repo_name: str):
    """
    Server-Sent Events (SSE) stream for real-time RLM progress updates.

    Uses an event list so no events are lost between polls.

    Usage (JavaScript):
        const eventSource = new EventSource(`http://localhost:8000/rlm/stream/${repoName}`);
        eventSource.onmessage = (event) => {
            const progress = JSON.parse(event.data);
            updateUI(progress);
        };
    """
    async def event_generator():
        """Generate SSE events from progress updates"""
        event_index = 0
        retry_count = 0
        max_retries = 600  # 3 minutes at 0.3s intervals

        # Send initial connection event
        yield f"data: {json.dumps({'type': 'connected', 'repo_name': repo_name})}\n\n"

        while retry_count < max_retries:
            if repo_name in analysis_events:
                events = analysis_events[repo_name]

                # Send all new events since our last index
                while event_index < len(events):
                    progress = events[event_index]
                    event_index += 1
                    retry_count = 0  # Reset retry count on new data

                    # Send progress data
                    yield f"data: {json.dumps(progress['data'])}\n\n"

                    # Check if analysis is complete
                    if progress['data'].get('type') in ['analysis_complete', 'error']:
                        yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"
                        return

            await asyncio.sleep(0.3)
            retry_count += 1

        # Timeout
        yield f"data: {json.dumps({'type': 'timeout', 'message': 'Stream timeout after 3 minutes'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@app.post("/analyze-full", response_model=FullAnalysisResponse)
async def analyze_full(request: FullAnalysisRequest):
    """
    Complete analysis: Clone GitHub repo, build graph, and optionally run RLM scan.

    This is a one-stop endpoint that:
    1. Downloads the GitHub repository
    2. Builds the code dependency graph
    3. Optionally runs RLM analysis (if run_rlm=true and RLM is available)

    Example request:
    {
        "url": "https://github.com/owner/repo",
        "force": false,
        "run_rlm": true
    }
    """
    try:
        from github_fetch import parse_github_url

        # Parse repo info
        owner, repo_name = parse_github_url(request.url)

        # Clear previous events for a fresh run
        analysis_events[repo_name] = []

        print(f"\n{'='*70}")
        print(f"FULL ANALYSIS: {owner}/{repo_name}")
        print(f"{'='*70}")

        # Step 1: Build graph
        import sys
        print(f"\n[1/2] Building code graph for {owner}/{repo_name}...", flush=True)
        sys.stdout.flush()

        emit_progress(repo_name, {
            "type": "graph_building",
            "repo_name": repo_name,
            "status": "Building code graph..."
        })

        loop = asyncio.get_event_loop()
        graph_result = await loop.run_in_executor(
            executor,
            lambda: pipeline.analyze(
                request.url,
                force_download=request.force,
                force_analyze=request.force
            )
        )

        graph_analysis = {
            "repo_name": graph_result.repo_name,
            "node_count": graph_result.node_count,
            "edge_count": graph_result.edge_count,
            "repo_path": str(graph_result.repo_path),
        }

        print(f"✓ Graph built: {graph_result.node_count} nodes, {graph_result.edge_count} edges", flush=True)
        sys.stdout.flush()

        emit_progress(repo_name, {
            "type": "graph_complete",
            "repo_name": repo_name,
            "nodes": graph_result.node_count,
            "edges": graph_result.edge_count,
        })

        # Step 2: Run RLM scan (if requested and available)
        rlm_analysis = None
        if request.run_rlm:
            if RLM_AVAILABLE and rlm_scanner:
                print(f"\n[2/2] Running RLM analysis on {repo_name}...", flush=True)
                print(f"      This may take several minutes depending on repository size", flush=True)
                sys.stdout.flush()

                emit_progress(repo_name, {
                    "type": "rlm_started",
                    "repo_name": repo_name,
                    "status": "Starting RLM analysis..."
                })

                # Call scan_repository directly since we already built the graph
                rlm_result = await loop.run_in_executor(
                    executor,
                    lambda: rlm_scanner.scan_repository(
                        str(graph_result.repo_path),
                        repo_name=repo_name,
                        skip_graph_building=True
                    )
                )

                rlm_analysis = {
                    "files_analyzed": rlm_result.get("files_analyzed"),
                    "issues_found": rlm_result.get("issues_found"),
                    "execution_time": rlm_result.get("execution_time"),
                }

                print(f"✓ RLM complete: {rlm_result.get('issues_found')} issues found in {rlm_result.get('execution_time', 0):.2f}s", flush=True)
                sys.stdout.flush()

                emit_progress(repo_name, {
                    "type": "analysis_complete",
                    "repo_name": repo_name,
                    "files_analyzed": rlm_result.get("files_analyzed"),
                    "issues_found": rlm_result.get("issues_found"),
                    "execution_time": rlm_result.get("execution_time")
                })
            else:
                print("\n[2/2] Skipping RLM (not available)", flush=True)
                sys.stdout.flush()
                rlm_analysis = {"error": "RLM scanner not available"}

        return FullAnalysisResponse(
            repo_name=repo_name,
            status="completed",
            graph_analysis=graph_analysis,
            rlm_analysis=rlm_analysis
        )

    except GitHubFetchError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/analyze-local", response_model=FullAnalysisResponse)
async def analyze_local(request: LocalAnalysisRequest):
    """
    Analyze a local repository from the repos/ directory.

    This endpoint:
    1. Builds the code dependency graph for the local repo
    2. Runs RLM analysis on the local repo
    3. Sends real-time progress via SSE

    Example request:
    {
        "repo_name": "demo_repo",
        "force": false,
        "run_rlm": true
    }
    """
    try:
        repo_name = request.repo_name
        repo_path = pipeline.repos_dir / repo_name

        if not repo_path.exists():
            raise HTTPException(status_code=404, detail=f"Local repository not found: {repo_name}")

        # Clear previous events for a fresh run
        analysis_events[repo_name] = []

        print(f"\n{'='*70}")
        print(f"LOCAL ANALYSIS: {repo_name}")
        print(f"{'='*70}")

        # Step 1: Build graph
        import sys
        from graph_builder import GraphBuilder

        print(f"\n[1/2] Building code graph for {repo_name}...", flush=True)
        sys.stdout.flush()

        emit_progress(repo_name, {
            "type": "graph_building",
            "repo_name": repo_name,
            "status": "Building code graph..."
        })

        loop = asyncio.get_event_loop()

        def build_graph():
            builder = GraphBuilder(str(repo_path))
            graph = builder.build()
            stats = builder.get_stats()

            # Save graph
            output_path = pipeline.output_dir / repo_name
            output_path.mkdir(parents=True, exist_ok=True)
            builder.save(str(output_path))

            return {
                "node_count": stats["nodes"],
                "edge_count": stats["edges"],
                "stats": stats
            }

        graph_result = await loop.run_in_executor(executor, build_graph)

        graph_analysis = {
            "repo_name": repo_name,
            "node_count": graph_result["node_count"],
            "edge_count": graph_result["edge_count"],
            "repo_path": str(repo_path),
        }

        print(f"[OK] Graph built: {graph_result['node_count']} nodes, {graph_result['edge_count']} edges", flush=True)
        sys.stdout.flush()

        emit_progress(repo_name, {
            "type": "graph_complete",
            "repo_name": repo_name,
            "nodes": graph_result["node_count"],
            "edges": graph_result["edge_count"],
            "languages": graph_result["stats"].get("languages", {})
        })

        # Step 2: Run RLM scan (if requested and available)
        rlm_analysis = None
        if request.run_rlm:
            if RLM_AVAILABLE and rlm_scanner:
                print(f"\n[2/2] Running RLM analysis on {repo_name}...", flush=True)
                print(f"      This may take several minutes depending on repository size", flush=True)
                sys.stdout.flush()

                emit_progress(repo_name, {
                    "type": "rlm_started",
                    "repo_name": repo_name,
                    "status": "Starting RLM analysis..."
                })

                rlm_result = await loop.run_in_executor(
                    executor,
                    lambda: rlm_scanner.scan_repository(
                        str(repo_path),
                        repo_name=repo_name,
                        skip_graph_building=True
                    )
                )

                rlm_analysis = {
                    "files_analyzed": rlm_result.get("files_analyzed"),
                    "issues_found": rlm_result.get("total_issues"),
                    "execution_time": rlm_result.get("execution_time"),
                }

                print(f"[OK] RLM complete: {rlm_result.get('total_issues')} issues found in {rlm_result.get('execution_time', 0):.2f}s", flush=True)
                sys.stdout.flush()

                emit_progress(repo_name, {
                    "type": "analysis_complete",
                    "repo_name": repo_name,
                    "files_analyzed": rlm_result.get("files_analyzed"),
                    "issues_found": rlm_result.get("total_issues"),
                    "execution_time": rlm_result.get("execution_time")
                })
            else:
                print("\n[2/2] Skipping RLM (not available)", flush=True)
                sys.stdout.flush()
                rlm_analysis = {"error": "RLM scanner not available"}

        return FullAnalysisResponse(
            repo_name=repo_name,
            status="completed",
            graph_analysis=graph_analysis,
            rlm_analysis=rlm_analysis
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# Run with: python -m src.api.server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
