import json
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Review


def create_review(
    db: Session,
    review_id: str,
    repo_name: str,
    repo_url: str,
    status: str,
    progress: str,
) -> Review:
    review = Review(
        id=review_id,
        repo_name=repo_name,
        repo_url=repo_url,
        status=status,
        progress=progress,
        created_at=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def get_review(db: Session, review_id: str) -> Optional[Review]:
    return db.get(Review, review_id)


def get_latest_review_for_repo(db: Session, repo_name: str) -> Optional[Review]:
    stmt = (
        select(Review)
        .where(Review.repo_name == repo_name)
        .order_by(Review.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalars().first()


def list_repo_names(db: Session) -> list[str]:
    stmt = select(Review.repo_name).distinct()
    return [row[0] for row in db.execute(stmt).all()]


def mark_running(db: Session, review: Review, progress: str = "running analysis") -> Review:
    review.status = "running"
    review.progress = progress
    db.commit()
    db.refresh(review)
    return review


def mark_done(
    db: Session,
    review: Review,
    result: dict,
    node_count: int | None,
    edge_count: int | None,
    progress: str = "completed",
) -> Review:
    review.status = "done"
    review.progress = progress
    review.node_count = node_count
    review.edge_count = edge_count
    review.result_json = json.dumps(result)
    db.commit()
    db.refresh(review)
    return review


def mark_failed(db: Session, review: Review, error_message: str, progress: str = "failed") -> Review:
    review.status = "failed"
    review.progress = progress
    review.error = error_message
    db.commit()
    db.refresh(review)
    return review
