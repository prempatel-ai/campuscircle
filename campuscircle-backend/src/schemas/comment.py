import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, description="Comment content")
    parent_id: Optional[uuid.UUID] = Field(default=None, description="Optional parent comment ID for replies")


class CommentOut(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    parent_id: Optional[uuid.UUID]
    author_id: uuid.UUID
    content: str
    depth: int
    score: int
    is_deleted: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedComments(BaseModel):
    items: List[CommentOut]
    total: int
    page: int
    size: int
