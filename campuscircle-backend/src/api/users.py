import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth.dependencies import get_current_user
from src.auth.security import hash_password, verify_password
from src.repositories.auth_repository import revoke_all_for_user
from src.models.user import User
from src.schemas.post import PostOut, PaginatedPosts
from src.schemas.user import (
    ChangePasswordRequest,
    ChangeUsernameRequest,
    UpdateNotificationsRequest,
    DeleteAccountRequest,
    UserProfileOut,
)
from src.repositories.post_repository import get_user_posts, get_saved_posts, get_commented_posts

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/me",
    response_model=UserProfileOut,
    status_code=status.HTTP_200_OK,
    summary="Get profile & settings of authenticated user"
)
async def get_my_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = select(User).where(User.id == user_uuid, User.is_deleted == False)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")
    return user


@router.patch(
    "/me/password",
    status_code=status.HTTP_200_OK,
    summary="Change password & revoke all other sessions"
)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = select(User).where(User.id == user_uuid, User.is_deleted == False)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )

    user.password_hash = hash_password(payload.new_password)
    await db.commit()

    # Revoke all refresh tokens EXCEPT the current session (if refresh token provided)
    await revoke_all_for_user(db=db, user_id=user.id, except_raw_token=payload.refresh_token)

    return {"message": "Password changed successfully. All other active sessions have been logged out."}


@router.patch(
    "/me/username",
    response_model=UserProfileOut,
    status_code=status.HTTP_200_OK,
    summary="Change username (rate-limited to 1 change per 30 days)"
)
async def change_username(
    payload: ChangeUsernameRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = select(User).where(User.id == user_uuid, User.is_deleted == False)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    new_uname = payload.new_username.strip()

    # 1. Uniqueness check -> 409 Conflict if duplicate
    dup_stmt = select(User).where(User.username == new_uname, User.id != user.id)
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken."
        )

    # 2. Rate limit check: 1 change per 30 days
    now = datetime.now(timezone.utc)
    if user.last_username_change_at:
        last_changed = user.last_username_change_at if user.last_username_change_at.tzinfo else user.last_username_change_at.replace(tzinfo=timezone.utc)
        days_since = (now - last_changed).days
        if days_since < 30:
            remaining_days = 30 - days_since
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Username can only be changed once every 30 days. Please wait {remaining_days} more day(s)."
            )

    user.username = new_uname
    user.last_username_change_at = now
    await db.commit()
    await db.refresh(user)

    return user


@router.patch(
    "/me/notifications",
    status_code=status.HTTP_200_OK,
    summary="Toggle notification preferences"
)
async def update_notifications(
    payload: UpdateNotificationsRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = select(User).where(User.id == user_uuid, User.is_deleted == False)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    user.notifications_enabled = payload.notifications_enabled
    await db.commit()

    return {
        "notifications_enabled": user.notifications_enabled,
        "message": "Notification preferences updated successfully."
    }


@router.delete(
    "/me",
    status_code=status.HTTP_200_OK,
    summary="Soft-delete user account & revoke all sessions"
)
async def delete_account(
    payload: DeleteAccountRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = select(User).where(User.id == user_uuid, User.is_deleted == False)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password confirmation is incorrect."
        )

    # Soft-delete: scrub email & password, set is_deleted=True
    user.email = f"deleted_{user.id}@deleted.local"
    user.password_hash = "$2b$12$DeletedUserNoLoginAllowedDummyHash1234567890"
    user.is_deleted = True
    user.notifications_enabled = False
    await db.commit()

    # Revoke ALL refresh tokens for user
    await revoke_all_for_user(db=db, user_id=user.id)

    return {"message": "Account deleted successfully."}


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
