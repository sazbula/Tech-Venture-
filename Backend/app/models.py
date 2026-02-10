from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, Integer, String, Text

from .database import Base


class Review(Base):
    __tablename__ = "reviews"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid4()))
    repo_name = Column(String, nullable=False, index=True)
    repo_url = Column(String, nullable=True)
    status = Column(String, nullable=False)
    progress = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    node_count = Column(Integer, nullable=True)
    edge_count = Column(Integer, nullable=True)
    result_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
