import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.auth.dependencies import get_current_user
from src.models.user import User
from src.models.community import Community
from src.models.post import Post
from src.schemas.post import PostCreate, ThreadCreate, PostOut, PaginatedPosts
from src.schemas.comment import CommentCreate, CommentOut
from src.repositories.post_repository import (
    create_post,
    create_thread,
    get_posts,
    get_post_by_id,
    get_thread_posts,
    search_posts,
    toggle_bookmark
)

router = APIRouter(prefix="/communities", tags=["posts"])
posts_router = APIRouter(prefix="/posts", tags=["posts"])


@router.post(
    "/{community_id}/posts",
    response_model=PostOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new post in a community"
)
async def create_new_post(
    community_id: str,
    payload: PostCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)
    uni_uuid = uuid.UUID(current_user["university_id"])
    
    try:
        community_uuid = uuid.UUID(community_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )
        
    # 1. Verify user is authenticated, verified, and not banned
    user_stmt = select(User).where(User.id == user_uuid)
    user_result = await db.execute(user_stmt)
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found."
        )
        
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address must be verified to post."
        )
        
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Banned users cannot create posts."
        )
        
    # 2. Look up community and verify university_id matching
    # Return 404 for both non-existent or other-university communities
    community_stmt = select(Community).where(Community.id == community_uuid)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()
    
    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )
        
    # 3. Create the post; capture the new post's UUID.
    new_post_id = await create_post(
        db=db,
        community_id=community_uuid,
        author_id=user_uuid,
        title=payload.title.strip(),
        content=payload.content.strip()
    )

    # 4. Fetch the enriched view using the ID we just received
    enriched = await get_post_by_id(db=db, post_id=new_post_id)
    return PostOut(
        id=enriched.post.id,
        community_id=enriched.post.community_id,
        author_id=enriched.post.author_id,
        author_username=enriched.author_username,
        title=enriched.post.title,
        content=enriched.post.content,
        score=enriched.post.score,
        comment_count=enriched.comment_count,
        thread_id=enriched.post.thread_id,
        thread_position=enriched.post.thread_position,
        thread_total_parts=enriched.thread_total_parts,
        created_at=enriched.post.created_at,
        updated_at=enriched.post.updated_at,
    )


@router.post(
    "/{community_id}/posts/thread",
    response_model=List[PostOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create a multi-part post thread"
)
async def create_new_thread(
    community_id: str,
    payload: ThreadCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)
    uni_uuid = uuid.UUID(current_user["university_id"])

    try:
        community_uuid = uuid.UUID(community_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )

    # 1. Verify user authenticated, verified, and not banned
    user_stmt = select(User).where(User.id == user_uuid)
    user_result = await db.execute(user_stmt)
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found."
        )

    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address must be verified to post."
        )

    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Banned users cannot create posts."
        )

    # 2. Look up community & verify university matching (404 if mismatch or missing)
    community_stmt = select(Community).where(Community.id == community_uuid)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()

    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )

    # 3. Create thread posts in single atomic transaction
    try:
        created_ids = await create_thread(
            db=db,
            community_id=community_uuid,
            author_id=user_uuid,
            title=payload.title.strip(),
            parts=payload.parts
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    # 4. Fetch enriched versions in order
    result_posts = []
    for pid in created_ids:
        enriched = await get_post_by_id(db=db, post_id=pid)
        if enriched:
            result_posts.append(
                PostOut(
                    id=enriched.post.id,
                    community_id=enriched.post.community_id,
                    author_id=enriched.post.author_id,
                    author_username=enriched.author_username,
                    title=enriched.post.title,
                    content=enriched.post.content,
                    score=enriched.post.score,
                    comment_count=enriched.comment_count,
                    thread_id=enriched.post.thread_id,
                    thread_position=enriched.post.thread_position,
                    thread_total_parts=enriched.thread_total_parts,
                    created_at=enriched.post.created_at,
                    updated_at=enriched.post.updated_at,
                )
            )

    return result_posts


@router.get(
    "/{community_id}/posts",
    response_model=PaginatedPosts,
    status_code=status.HTTP_200_OK,
    summary="Get posts in a community"
)
async def list_community_posts(
    community_id: str,
    sort: str = Query("new", enum=["new", "top", "hot"], description="Sorting algorithm"),
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    uni_uuid = uuid.UUID(current_user["university_id"])
    
    try:
        community_uuid = uuid.UUID(community_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )
        
    community_stmt = select(Community).where(Community.id == community_uuid)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()
    
    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )
        
    enriched_items, total = await get_posts(
        db=db,
        community_id=community_uuid,
        sort=sort,
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
    "/{community_id}/posts/search",
    response_model=PaginatedPosts,
    status_code=status.HTTP_200_OK,
    summary="Search posts in a community by title/content"
)
async def search_community_posts(
    community_id: str,
    q: str = Query(..., description="Search query string"),
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not q or not q.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query cannot be empty."
        )

    uni_uuid = uuid.UUID(current_user["university_id"])
    try:
        community_uuid = uuid.UUID(community_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )

    community_stmt = select(Community).where(Community.id == community_uuid)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()

    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )

    enriched_items, total = await search_posts(
        db=db,
        community_id=community_uuid,
        query_str=q,
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


@posts_router.get(
    "/{post_id}",
    response_model=PostOut,
    status_code=status.HTTP_200_OK,
    summary="Get a single post details"
)
async def get_single_post(
    post_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    uni_uuid = uuid.UUID(current_user["university_id"])
    try:
        post_uuid = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )
        
    enriched = await get_post_by_id(db=db, post_id=post_uuid)

    if not enriched:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )

    community_stmt = select(Community).where(Community.id == enriched.post.community_id)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()

    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )

    return PostOut(
        id=enriched.post.id,
        community_id=enriched.post.community_id,
        author_id=enriched.post.author_id,
        author_username=enriched.author_username,
        title=enriched.post.title,
        content=enriched.post.content,
        score=enriched.post.score,
        comment_count=enriched.comment_count,
        thread_id=enriched.post.thread_id,
        thread_position=enriched.post.thread_position,
        thread_total_parts=enriched.thread_total_parts,
        created_at=enriched.post.created_at,
        updated_at=enriched.post.updated_at,
    )


@posts_router.get(
    "/{post_id}/thread",
    response_model=List[PostOut],
    status_code=status.HTTP_200_OK,
    summary="Get all parts of a post thread"
)
async def get_post_thread(
    post_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    uni_uuid = uuid.UUID(current_user["university_id"])
    try:
        post_uuid = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )

    post_stmt = select(Post).where(Post.id == post_uuid, Post.is_deleted == False)
    post_result = await db.execute(post_stmt)
    post = post_result.scalar_one_or_none()

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )

    community_stmt = select(Community).where(Community.id == post.community_id)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()

    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )

    enriched_parts = await get_thread_posts(db=db, post_id=post_uuid)

    return [
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
        for e in enriched_parts
    ]


@posts_router.get(
    "/{post_id}/comments",
    response_model=List[CommentOut],
    status_code=status.HTTP_200_OK,
    summary="Get comments for a post"
)
async def get_post_comments(
    post_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    uni_uuid = uuid.UUID(current_user["university_id"])
    try:
        post_uuid = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )
        
    post_stmt = select(Post).where(Post.id == post_uuid, Post.is_deleted == False)
    post_result = await db.execute(post_stmt)
    post = post_result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )
        
    community_stmt = select(Community).where(Community.id == post.community_id)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()
    
    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )
        
    from src.repositories.comment_repository import get_comments_for_post
    comments = await get_comments_for_post(db=db, post_id=post_uuid)
    return comments


@posts_router.post(
    "/{post_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new comment or reply"
)
async def create_new_comment(
    post_id: str,
    payload: CommentCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)
    uni_uuid = uuid.UUID(current_user["university_id"])
    
    try:
        post_uuid = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )
        
    user_stmt = select(User).where(User.id == user_uuid)
    user_result = await db.execute(user_stmt)
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found."
        )
        
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address must be verified to comment."
        )
        
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Banned users cannot comment."
        )
        
    post_stmt = select(Post).where(Post.id == post_uuid, Post.is_deleted == False)
    post_result = await db.execute(post_stmt)
    post = post_result.scalar_one_or_none()
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )
        
    community_stmt = select(Community).where(Community.id == post.community_id)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()
    
    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )
        
    from src.repositories.comment_repository import create_comment
    try:
        comment = await create_comment(
            db=db,
            post_id=post_uuid,
            author_id=user_uuid,
            content=payload.content.strip(),
            parent_id=payload.parent_id
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
        
    return comment


@posts_router.post(
    "/{post_id}/bookmark",
    status_code=status.HTTP_200_OK,
    summary="Toggle bookmark status for a post"
)
async def toggle_post_bookmark(
    post_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)
    uni_uuid = uuid.UUID(current_user["university_id"])

    try:
        post_uuid = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )

    post_stmt = select(Post).where(Post.id == post_uuid, Post.is_deleted == False)
    post_result = await db.execute(post_stmt)
    post = post_result.scalar_one_or_none()

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )

    community_stmt = select(Community).where(Community.id == post.community_id)
    community_result = await db.execute(community_stmt)
    community = community_result.scalar_one_or_none()

    if not community or community.university_id != uni_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found."
        )

    is_bookmarked = await toggle_bookmark(db=db, user_id=user_uuid, post_id=post_uuid)
    return {"post_id": post_id, "is_bookmarked": is_bookmarked}
