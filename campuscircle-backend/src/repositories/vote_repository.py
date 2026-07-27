import uuid
from typing import Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.vote import Vote
from src.models.post import Post
from src.models.comment import Comment


async def cast_vote(
    db: AsyncSession,
    user_id: uuid.UUID,
    target_id: uuid.UUID,
    target_type: str,
    value: int
) -> Tuple[int, Optional[int]]:
    """
    Polymorphic cast vote system.
    Returns a tuple: (new_score, user_vote).
    If user clicks the same vote again, it deletes the vote (un-vote) and user_vote is None.
    If user switches vote, it updates the vote value and adjusts the score.
    Raises ValueError if target doesn't exist.
    """
    # 1. Fetch the target and ensure it exists and isn't deleted
    if target_type == "post":
        stmt = select(Post).where(Post.id == target_id, Post.is_deleted == False)
        res = await db.execute(stmt)
        target = res.scalar_one_or_none()
    else:
        stmt = select(Comment).where(Comment.id == target_id, Comment.is_deleted == False)
        res = await db.execute(stmt)
        target = res.scalar_one_or_none()
        
    if not target:
        raise ValueError(f"Target {target_type} not found")
        
    # 2. Check if a vote already exists
    vote_stmt = select(Vote).where(
        Vote.user_id == user_id,
        Vote.target_id == target_id,
        Vote.target_type == target_type
    )
    vote_res = await db.execute(vote_stmt)
    existing_vote = vote_res.scalar_one_or_none()
    
    user_vote: Optional[int] = None
    
    if existing_vote:
        if existing_vote.value == value:
            # Unvote: clicked active vote again
            await db.delete(existing_vote)
            target.score -= value
            user_vote = None
        else:
            # Switch vote: clicked opposite vote
            existing_vote.value = value
            target.score += 2 * value
            user_vote = value
    else:
        # New vote
        new_vote = Vote(
            user_id=user_id,
            target_id=target_id,
            target_type=target_type,
            value=value
        )
        db.add(new_vote)
        target.score += value
        user_vote = value
        
    await db.flush()
    await db.commit()
    return target.score, user_vote


async def get_user_vote_value(
    db: AsyncSession,
    user_id: uuid.UUID,
    target_id: uuid.UUID,
    target_type: str
) -> Optional[int]:
    """
    Retrieve the vote value cast by a specific user on a specific target.
    """
    stmt = select(Vote.value).where(
        Vote.user_id == user_id,
        Vote.target_id == target_id,
        Vote.target_type == target_type
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
