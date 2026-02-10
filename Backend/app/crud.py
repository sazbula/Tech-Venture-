import json
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from .models import Review


def create_review(db: Session, review_id: str, status: str, progress: str) -> Review:
    review = Review(
        id=review_id,
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


def mark_running(db: Session, review: Review, progress: str = "running stub review") -> Review:
    review.status = "running"
    review.progress = progress
    db.commit()
    db.refresh(review)
    return review


def mark_done(db: Session, review: Review, result: dict, progress: str = "completed") -> Review:
    review.status = "done"
    review.progress = progress
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
