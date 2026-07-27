import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.comment import Comment


async def create_comment(
    db: AsyncSession,
    post_id: uuid.UUID,
    author_id: uuid.UUID,
    content: str,
    parent_id: Optional[uuid.UUID] = None
) -> Comment:
    """
    Creates a comment for a post. If parent_id is specified, determines the nesting depth.
    Raises ValueError if maximum nesting depth (8) is exceeded or parent comment is not found/mismatched.
    """
    depth = 0
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

    comment = Comment(
        post_id=post_id,
        parent_id=parent_id,
        author_id=author_id,
        content=content,
        depth=depth
    )
    
    db.add(comment)
    await db.flush()
    await db.commit()
    return comment


async def get_comments_for_post(
    db: AsyncSession,
    post_id: uuid.UUID
) -> List[Comment]:
    """
    Retrieves all active comments for a given post.
    """
    stmt = select(Comment).where(Comment.post_id == post_id).order_by(Comment.created_at.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())
