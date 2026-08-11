import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth.dependencies import require_university_student
from src.schemas.post import PostOut, PaginatedPosts
from src.repositories.post_repository import get_for_you_feed

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get(
    "/for-you",
    response_model=PaginatedPosts,
    status_code=status.HTTP_200_OK,
    summary="Get personalized For You feed for current user"
)
async def get_personalized_for_you_feed(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: dict = Depends(require_university_student),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    uni_uuid = uuid.UUID(current_user["university_id"])

    enriched_items, total = await get_for_you_feed(
        db=db,
        user_id=user_uuid,
        university_id=uni_uuid,
        page=page,
        size=size
    )

    post_out_items = [
        PostOut(
            id=item.post.id,
            community_id=item.post.community_id,
            author_id=item.post.author_id,
            author_username=item.author_username,
            title=item.post.title,
            content=item.post.content,
            score=item.post.score,
            comment_count=item.comment_count,
            thread_id=item.post.thread_id,
            thread_position=item.post.thread_position,
            thread_total_parts=item.thread_total_parts,
            created_at=item.post.created_at,
            updated_at=item.post.updated_at,
        )
        for item in enriched_items
    ]

    return PaginatedPosts(
        items=post_out_items,
        total=total,
        page=page,
        size=size
    )
