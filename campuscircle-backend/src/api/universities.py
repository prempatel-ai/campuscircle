import uuid
from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth.dependencies import get_current_user
from src.schemas.tag import TrendingTagResponse, PaginatedTrendingTags
from src.repositories.tag_repository import get_trending_tags

router = APIRouter(prefix="/universities", tags=["universities"])


@router.get(
    "/me/trending-tags",
    response_model=PaginatedTrendingTags,
    status_code=status.HTTP_200_OK,
    summary="Get top trending tags in user's university"
)
async def get_my_university_trending_tags(
    limit: int = Query(10, ge=1, le=50, description="Max number of trending tags to return"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    uni_uuid = uuid.UUID(current_user["university_id"])
    raw_tags = await get_trending_tags(db=db, university_id=uni_uuid, limit=limit, hours_window=48)

    items = [
        TrendingTagResponse(name=tag_name, post_count=count)
        for tag_name, count in raw_tags
    ]

    return PaginatedTrendingTags(items=items)
