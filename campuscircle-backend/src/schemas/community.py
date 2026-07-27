import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class CommunityCreate(BaseModel):
    """
    Pydantic schema for creating a community.
    Accepts name and description. NEVER accept university_id or created_by.
    """
    name: str = Field(..., min_length=2, max_length=64, description="The name of the community.")
    description: Optional[str] = Field(None, max_length=500, description="The description of the community.")


class CommunityOut(BaseModel):
    """
    Pydantic schema for community output.
    """
    id: uuid.UUID
    university_id: uuid.UUID
    created_by: uuid.UUID
    name: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedCommunities(BaseModel):
    """
    Pydantic schema for paginated list of communities.
    """
    items: List[CommunityOut]
    total: int
    page: int
    size: int
