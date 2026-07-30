import uuid
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth.dependencies import get_current_user
from src.schemas.post import PostOut, PaginatedPosts
from src.repositories.post_repository import get_user_posts, get_saved_posts, get_commented_posts

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/me/posts",
    response_model=PaginatedPosts,
    status_code=status.HTTP_200_OK,
    summary="Get authenticated user's own post history"
)
async def get_my_posts(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)

    enriched_items, total = await get_user_posts(
        db=db,
        author_id=user_uuid,
        page=page,
        size=size
    )

    post_out_items = [
        PostOut(
            id=e.post.id,
            community_id=e.post.community_id,
            author_id=e.post.author_id,
            author_username=e.author_username,
            title=e.post.title,
            content=e.post.content,
            score=e.post.score,
            comment_count=e.comment_count,
            thread_id=e.post.thread_id,
            thread_position=e.post.thread_position,
            thread_total_parts=e.thread_total_parts,
            created_at=e.post.created_at,
            updated_at=e.post.updated_at,
        )
        for e in enriched_items
    ]

    return PaginatedPosts(
        items=post_out_items,
        total=total,
        page=page,
        size=size
    )


@router.get(
    "/me/saved",
    response_model=PaginatedPosts,
    status_code=status.HTTP_200_OK,
    summary="Get authenticated user's saved/bookmarked posts"
)
async def get_my_saved_posts(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)

    enriched_items, total = await get_saved_posts(
        db=db,
        user_id=user_uuid,
        page=page,
        size=size
    )

    post_out_items = [
        PostOut(
            id=e.post.id,
            community_id=e.post.community_id,
            author_id=e.post.author_id,
            author_username=e.author_username,
            title=e.post.title,
            content=e.post.content,
            score=e.post.score,
            comment_count=e.comment_count,
            thread_id=e.post.thread_id,
            thread_position=e.post.thread_position,
            thread_total_parts=e.thread_total_parts,
            created_at=e.post.created_at,
            updated_at=e.post.updated_at,
        )
        for e in enriched_items
    ]

    return PaginatedPosts(
        items=post_out_items,
        total=total,
        page=page,
        size=size
    )


@router.get(
    "/me/commented",
    response_model=PaginatedPosts,
    status_code=status.HTTP_200_OK,
    summary="Get posts where authenticated user has commented"
)
async def get_my_commented_posts(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)

    enriched_items, total = await get_commented_posts(
        db=db,
        user_id=user_uuid,
        page=page,
        size=size
    )

    post_out_items = [
        PostOut(
            id=e.post.id,
            community_id=e.post.community_id,
            author_id=e.post.author_id,
            author_username=e.author_username,
            title=e.post.title,
            content=e.post.content,
            score=e.post.score,
            comment_count=e.comment_count,
            thread_id=e.post.thread_id,
            thread_position=e.post.thread_position,
            thread_total_parts=e.thread_total_parts,
            created_at=e.post.created_at,
            updated_at=e.post.updated_at,
        )
        for e in enriched_items
    ]

    return PaginatedPosts(
        items=post_out_items,
        total=total,
        page=page,
        size=size
    )
