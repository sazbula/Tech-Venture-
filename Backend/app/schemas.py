from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    diff_text: str = Field(..., description="Unified diff text to review")


class ReviewQueuedResponse(BaseModel):
    review_id: str = Field(..., description="Identifier for the review job")
    status: str = Field(..., description="Job status: queued")


class ReviewProgressResponse(BaseModel):
    status: str
    progress: str


class ReviewResultResponse(BaseModel):
    status: str
    progress: str
    comments: List[Dict[str, Any]]
    meta: Dict[str, Any]


class ReviewFailedResponse(BaseModel):
    status: str
    progress: str
    error: str


class HealthResponse(BaseModel):
    status: str = "ok"
