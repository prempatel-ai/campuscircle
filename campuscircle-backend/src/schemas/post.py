import uuid
from datetime import datetime
from typing import List
from pydantic import BaseModel, Field, field_validator


class PostCreate(BaseModel):
    """
    Pydantic schema for creating a post.
    Accepts title and content. NEVER accept author_id, community_id, score, or is_deleted.
    """
    title: str = Field(..., min_length=3, max_length=300, description="The title of the post.")
    content: str = Field(..., min_length=3, max_length=4000, description="The content of the post.")


class ThreadCreate(BaseModel):
    """
    Pydantic schema for creating a multi-part post thread.
    Accepts title and ordered list of 2-25 text parts.
    """
    title: str = Field(..., min_length=3, max_length=300, description="The title of the post thread.")
    parts: List[str] = Field(
        ...,
        min_length=2,
        max_length=25,
        description="Ordered list of 2-25 thread content parts."
    )

    @field_validator("parts")
    @classmethod
    def validate_parts_length(cls, v: List[str]) -> List[str]:
        for i, part in enumerate(v):
            if len(part.strip()) < 3:
                raise ValueError(f"Thread part {i + 1} must be at least 3 characters.")
            if len(part) > 4000:
                raise ValueError(f"Thread part {i + 1} cannot exceed 4000 characters.")
        return v


class PostOut(BaseModel):
    """
    Public post response schema.

    Security contract:
    - author_username: only the username field from the joined User row — never
      email, password_hash, is_banned, or university_id.
    - comment_count: real COUNT(comments.id) WHERE post_id = this post AND
      is_deleted = false. Never a placeholder.
    - is_deleted is intentionally omitted — callers should never see soft-deleted posts;
      the repository filters them out before they reach here.
    """
    id: uuid.UUID
    community_id: uuid.UUID
    author_id: uuid.UUID
    author_username: str          # joined from users.username — ONLY this field
    title: str
    content: str
    score: int
    comment_count: int            # real COUNT from comments table
    thread_id: uuid.UUID | None = None
    thread_position: int | None = None
    thread_total_parts: int = 1
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaginatedPosts(BaseModel):
    """
    Pydantic schema for paginated list of posts.
    """
    items: List[PostOut]
    total: int
    page: int
    size: int
