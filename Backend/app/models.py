from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, String, Text

from .database import Base


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    status = Column(String, nullable=False)
    progress = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    result_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
