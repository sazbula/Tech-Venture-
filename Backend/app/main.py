import json
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .database import Base, SessionLocal, engine, get_db
from .review_engine import run_review

# Ensure database tables exist on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Contextify Backend MVP")

# Permissive CORS for MVP; tighten later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=schemas.HealthResponse)
def healthcheck():
    return {"status": "ok"}


@app.post(
    "/api/reviews",
    response_model=schemas.ReviewQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_review(
    payload: schemas.ReviewCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if not payload.diff_text.strip():
        raise HTTPException(status_code=400, detail="diff_text is required")

    review_id = str(uuid4())
    crud.create_review(db, review_id, status="queued", progress="queued")

    background_tasks.add_task(_process_review_task, review_id, payload.diff_text)

    return {"review_id": review_id, "status": "queued"}


@app.get("/api/reviews/{review_id}")
def get_review(review_id: str, db: Session = Depends(get_db)):
    review = crud.get_review(db, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.status == "done":
        result = json.loads(review.result_json or "{}")
        return {
            "status": review.status,
            "progress": review.progress,
            "comments": result.get("comments", []),
            "meta": result.get("meta", {}),
        }

    if review.status == "failed":
        return {
            "status": review.status,
            "progress": review.progress,
            "error": review.error or "Unknown error",
        }

    return {"status": review.status, "progress": review.progress}


def _process_review_task(review_id: str, diff_text: str):
    # Background task runs outside request scope; open a new session.
    db = SessionLocal()
    review = None
    try:
        review = crud.get_review(db, review_id)
        if not review:
            return

        crud.mark_running(db, review, progress="running stub review")
        result = run_review(diff_text=diff_text, repo_path=None)
        crud.mark_done(db, review, result, progress="completed")
    except Exception as exc:  # pragma: no cover - defensive logging
        if review:
            crud.mark_failed(db, review, error_message=str(exc), progress="failed")
    finally:
        db.close()
