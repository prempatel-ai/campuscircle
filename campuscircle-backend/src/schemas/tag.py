from pydantic import BaseModel, Field
from typing import List


class TrendingTagResponse(BaseModel):
    """
    Pydantic schema representing a trending hashtag scoped to a university.
    """
    name: str = Field(..., description="Tag name (without hash prefix)")
    post_count: int = Field(..., description="Number of posts tagged in the last 48 hours")


class PaginatedTrendingTags(BaseModel):
    """
    Pydantic schema for list of trending tags.
    """
    items: List[TrendingTagResponse]
