import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.comment import Comment
from src.models.user import User


async def create_comment(
    db: AsyncSession,
    post_id: uuid.UUID,
    author_id: uuid.UUID,
    content: str,
    parent_id: Optional[uuid.UUID] = None
) -> Comment:
    """
    Creates a comment for a post. If parent_id is specified, determines the nesting depth.
    Automatically creates a notification for the recipient (post author or parent comment author),
    skipping self-notifications.
    Raises ValueError if maximum nesting depth (8) is exceeded or parent comment is not found/mismatched.
    """
    from src.models.post import Post
    from src.models.notification import Notification

    depth = 0
    parent_author_id: Optional[uuid.UUID] = None

    if parent_id:
        parent_stmt = select(Comment).where(Comment.id == parent_id)
        parent_res = await db.execute(parent_stmt)
        parent = parent_res.scalar_one_or_none()
        
        if not parent:
            raise ValueError("Parent comment not found")
        if parent.post_id != post_id:
            raise ValueError("Parent comment belongs to a different post")
            
        depth = parent.depth + 1
        if depth > 8:
            raise ValueError("Maximum reply depth (8) exceeded")

        parent_author_id = parent.author_id

    comment = Comment(
        post_id=post_id,
        parent_id=parent_id,
        author_id=author_id,
        content=content,
        depth=depth
    )
    
    db.add(comment)
    await db.flush()

    # Determine notification recipient
    recipient_id: Optional[uuid.UUID] = None
    notification_type: str = "reply_to_post"

    if parent_id and parent_author_id:
        recipient_id = parent_author_id
        notification_type = "reply_to_comment"
    else:
        post_stmt = select(Post.author_id).where(Post.id == post_id)
        post_res = await db.execute(post_stmt)
        recipient_id = post_res.scalar_one_or_none()
        notification_type = "reply_to_post"

    # Create notification if recipient exists, is NOT the actor, has notifications_enabled=True, and is not deleted
    if recipient_id and recipient_id != author_id:
        recipient_res = await db.execute(select(User).where(User.id == recipient_id))
        recipient_user = recipient_res.scalar_one_or_none()
        if recipient_user and recipient_user.notifications_enabled and not recipient_user.is_deleted:
            notif = Notification(
                recipient_id=recipient_id,
                actor_id=author_id,
                type=notification_type,
                target_id=comment.id,
                related_post_id=post_id
            )
            db.add(notif)
            await db.flush()

    await db.commit()
    return comment


async def get_comments_for_post(
    db: AsyncSession,
    post_id: uuid.UUID
) -> List[Comment]:
    """
    Retrieves all active comments for a given post. If author is deleted, sets author_username to '[deleted]'.
    """
    from sqlalchemy import case
    from src.models.user import User

    stmt = (
        select(Comment, case((User.is_deleted == True, "[deleted]"), else_=User.username).label("author_username"))
        .outerjoin(User, User.id == Comment.author_id)
        .where(Comment.post_id == post_id)
        .order_by(Comment.created_at.asc())
    )
    result = await db.execute(stmt)
    comments = []
    for comment_obj, author_username in result.all():
        setattr(comment_obj, "author_username", author_username or "[deleted]")
        comments.append(comment_obj)
    return comments
