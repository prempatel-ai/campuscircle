import uuid
from typing import NamedTuple, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth.dependencies import get_current_user
from src.models.user import User
from src.models.notification import Notification
from src.schemas.notification import NotificationOut, PaginatedNotifications, UnreadCountOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get(
    "/unread-count",
    response_model=UnreadCountOut,
    status_code=status.HTTP_200_OK,
    summary="Get unread notifications count for current user"
)
async def get_unread_count(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = select(func.count(Notification.id)).where(
        Notification.recipient_id == user_uuid,
        Notification.is_read == False
    )
    result = await db.execute(stmt)
    count = result.scalar_one() or 0
    return UnreadCountOut(unread_count=count)


@router.get(
    "",
    response_model=PaginatedNotifications,
    status_code=status.HTTP_200_OK,
    summary="Get current user's notifications"
)
async def list_notifications(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])

    # Count total notifications for recipient
    count_stmt = select(func.count(Notification.id)).where(
        Notification.recipient_id == user_uuid
    )
    count_res = await db.execute(count_stmt)
    total = count_res.scalar_one() or 0

    # Fetch paginated notifications joined with actor User to get actor_username
    query = (
        select(Notification, User.username.label("actor_username"))
        .join(User, User.id == Notification.actor_id)
        .where(Notification.recipient_id == user_uuid)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )

    res = await db.execute(query)
    rows = res.all()

    items = [
        NotificationOut(
            id=notif.id,
            recipient_id=notif.recipient_id,
            actor_id=notif.actor_id,
            actor_username=actor_uname,
            type=notif.type,
            target_id=notif.target_id,
            related_post_id=notif.related_post_id,
            is_read=notif.is_read,
            created_at=notif.created_at
        )
        for notif, actor_uname in rows
    ]

    return PaginatedNotifications(
        items=items,
        total=total,
        page=page,
        size=size
    )


@router.post(
    "/{notification_id}/read",
    response_model=NotificationOut,
    status_code=status.HTTP_200_OK,
    summary="Mark a notification as read"
)
async def mark_notification_as_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])

    try:
        notif_uuid = uuid.UUID(notification_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found."
        )

    stmt = select(Notification).where(
        Notification.id == notif_uuid,
        Notification.recipient_id == user_uuid
    )
    res = await db.execute(stmt)
    notif = res.scalar_one_or_none()

    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found."
        )

    notif.is_read = True
    await db.flush()
    await db.commit()

    actor_stmt = select(User.username).where(User.id == notif.actor_id)
    actor_res = await db.execute(actor_stmt)
    actor_username = actor_res.scalar_one()

    return NotificationOut(
        id=notif.id,
        recipient_id=notif.recipient_id,
        actor_id=notif.actor_id,
        actor_username=actor_username,
        type=notif.type,
        target_id=notif.target_id,
        related_post_id=notif.related_post_id,
        is_read=notif.is_read,
        created_at=notif.created_at
    )
