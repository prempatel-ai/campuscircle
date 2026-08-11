import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.auth.dependencies import require_university_student
from src.models.user import User
from src.schemas.vote import VotePayload, VoteResult
from src.repositories.vote_repository import cast_vote

router = APIRouter(prefix="/votes", tags=["votes"])


@router.post(
    "",
    response_model=VoteResult,
    status_code=status.HTTP_200_OK,
    summary="Cast or toggle a vote on a post or comment"
)
async def cast_or_toggle_vote(
    payload: VotePayload,
    current_user: dict = Depends(require_university_student),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)
    
    # 1. Verify user exists and is not banned/unverified
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
            detail="Email address must be verified to vote."
        )
        
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Banned users cannot vote."
        )
        
    # 2. Cast vote
    try:
        new_score, user_vote = await cast_vote(
            db=db,
            user_id=user_uuid,
            target_id=payload.target_id,
            target_type=payload.target_type,
            value=payload.value
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
        
    return VoteResult(
        target_id=payload.target_id,
        target_type=payload.target_type,
        new_score=new_score,
        user_vote=user_vote
    )
