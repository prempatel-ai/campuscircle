import uuid
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class VotePayload(BaseModel):
    target_id: uuid.UUID
    target_type: str = Field(..., description="Either 'post' or 'comment'")
    value: int = Field(..., description="1 for upvote, -1 for downvote")

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        if v not in ("post", "comment"):
            raise ValueError("target_type must be either 'post' or 'comment'")
        return v

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: int) -> int:
        if v not in (-1, 1):
            raise ValueError("value must be either 1 or -1")
        return v


class VoteResult(BaseModel):
    target_id: uuid.UUID
    target_type: str
    new_score: int
    user_vote: Optional[int] = None  # None if unvoted, otherwise 1 or -1
