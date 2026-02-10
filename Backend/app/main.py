import json
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, inspect, text
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .database import Base, SessionLocal, engine, get_db
from .demo_data import build_demo_result
from .review_engine import run_analysis, summarize_counts


def ensure_schema() -> None:
    insp = inspect(engine)
    tables = insp.get_table_names()
    if "reviews" not in tables:
        Base.metadata.create_all(bind=engine)
        return

    cols = {c["name"] for c in insp.get_columns("reviews")}
    expected = {
        "id",
        "repo_name",
        "repo_url",
        "status",
        "progress",
        "created_at",
        "node_count",
        "edge_count",
        "result_json",
        "error",
    }

    # If schema is missing columns, recreate table (dev-friendly reset)
    if not expected.issubset(cols):
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS reviews"))
        Base.metadata.create_all(bind=engine)


# Ensure database tables exist on startup
ensure_schema()

app = FastAPI(title="Contextify Backend MVP")

# Permissive CORS for MVP; tighten later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=schemas.HealthResponse)
@app.get("/api/health", response_model=schemas.HealthResponse)
def healthcheck():
    return {"status": "ok"}


@app.post("/analyze", response_model=schemas.AnalyzeResponse, status_code=status.HTTP_202_ACCEPTED)
def analyze(
    payload: schemas.AnalyzeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # Extract repo name from URL (org/repo)
    repo_name = _repo_name_from_url(str(payload.url)) if not payload.demo else "contextify-demo"
    review_id = str(uuid4())

    crud.create_review(
        db,
        review_id=review_id,
        repo_name=repo_name,
        repo_url=str(payload.url),
        status="queued",
        progress="queued",
    )

    background_tasks.add_task(_process_analysis_task, review_id, repo_name, str(payload.url))

    return schemas.AnalyzeResponse(
        review_id=review_id,
        repo_name=repo_name,
        status="queued",
        node_count=None,
        edge_count=None,
        message="Analysis queued",
    )


@app.get("/graph/{repo_name}/vis", response_model=schemas.GraphResponse)
def graph_vis(
    repo_name: str,
    files_only: bool = Query(True, alias="files_only"),
    db: Session = Depends(get_db),
):
    # Demo mode bypasses DB
    if repo_name in {"demo", "contextify-demo"}:
        nodes, edges, _, counts = build_demo_result()
        return {"nodes": nodes, "edges": edges, "severity_counts": counts}

    review = crud.get_latest_review_for_repo(db, repo_name)
    if not review:
        raise HTTPException(status_code=404, detail="Repository not analyzed")

    if review.status != "done":
        return schemas.GraphResponse(nodes=[], edges=[], severity_counts={})

    result = json.loads(review.result_json or "{}")
    graph = result.get("graph")
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not available")

    return {
        "nodes": graph.get("nodes", []),
        "edges": graph.get("edges", []),
        "severity_counts": graph.get("severity_counts", {}),
    }


@app.get("/graph/{repo_name}/issues", response_model=schemas.IssuesResponse)
def graph_issues(repo_name: str, db: Session = Depends(get_db)):
    if repo_name in {"demo", "contextify-demo"}:
        _, _, issues, _ = build_demo_result()
        return {"issues": issues}

    review = crud.get_latest_review_for_repo(db, repo_name)
    if not review:
        raise HTTPException(status_code=404, detail="Repository not analyzed")

    if review.status != "done":
        return {"issues": []}

    result = json.loads(review.result_json or "{}")
    issues = result.get("issues", [])
    return {"issues": issues}


@app.get("/repos")
def list_repos(db: Session = Depends(get_db)):
    repos = crud.list_repo_names(db)
    # Always include demo for easy access
    if "contextify-demo" not in repos:
        repos.append("contextify-demo")
    return {"repos": repos}


@app.delete("/graph/{repo_name}")
def delete_repo(repo_name: str, db: Session = Depends(get_db)):
    stmt = delete(models.Review).where(models.Review.repo_name == repo_name)
    db.execute(stmt)
    db.commit()
    return {"status": "deleted", "repo": repo_name}


@app.get("/api/reviews/{review_id}")
def get_review(review_id: str, db: Session = Depends(get_db)):
    review = crud.get_review(db, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    payload: dict = {"status": review.status, "progress": review.progress}
    if review.status == "done":
        result = json.loads(review.result_json or "{}")
        payload.update(
            {
                "graph": result.get("graph", {}),
                "issues": result.get("issues", []),
                "meta": result.get("meta", {}),
            }
        )
    elif review.status == "failed":
        payload["error"] = review.error or "Unknown error"
    return payload


def _process_analysis_task(review_id: str, repo_name: str, repo_url: str):
    db = SessionLocal()
    review = None
    try:
        review = crud.get_review(db, review_id)
        if not review:
            return

        crud.mark_running(db, review, progress="running analysis")
        result = run_analysis(repo_name=repo_name, repo_url=repo_url)
        node_count, edge_count = summarize_counts(result)
        crud.mark_done(db, review, result, node_count=node_count, edge_count=edge_count, progress="completed")
    except Exception as exc:  # pragma: no cover - defensive logging
        if review:
            crud.mark_failed(db, review, error_message=str(exc), progress="failed")
    finally:
        db.close()


def _repo_name_from_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    if not path or path.count("/") < 1:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")
    org_repo = "/".join(path.split("/")[:2])
    return org_repo
