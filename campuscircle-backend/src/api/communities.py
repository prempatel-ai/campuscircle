import uuid
import time
from collections import defaultdict
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.auth.dependencies import require_university_student
from src.models.user import User
from src.schemas.community import CommunityCreate, CommunityOut, PaginatedCommunities
from src.repositories.community_repository import (
    create_community,
    get_communities,
    DuplicateCommunityError,
)

router = APIRouter(prefix="/communities", tags=["communities"])


from src.utils.rate_limit import InMemoryRateLimiter

community_creation_limiter = InMemoryRateLimiter(limit=5, window_seconds=3600)


@router.post(
    "",
    response_model=CommunityOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new community"
)
async def create_new_community(
    payload: CommunityCreate,
    current_user: dict = Depends(require_university_student),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = current_user["user_id"]
    user_uuid = uuid.UUID(user_id_str)
    uni_uuid = uuid.UUID(current_user["university_id"])
    
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
            detail="Email address must be verified to create a community."
        )
        
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Banned users cannot create communities."
        )
        
    # 2. Check rate limit (max 5 per hour)
    if community_creation_limiter.is_rate_limited(user_id_str):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. You can create at most 5 communities per hour."
        )
        
    # 3. Create the community in the repository (ignores university_id from request payload, uses current_user)
    try:
        community = await create_community(
            db=db,
            university_id=uni_uuid,
            created_by=user_uuid,
            name=payload.name.strip(),
            description=payload.description.strip() if payload.description else None
        )
    except DuplicateCommunityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
        
    # 4. Record successful creation in rate limiter
    community_creation_limiter.record(user_id_str)
    
    return community


@router.get(
    "",
    response_model=PaginatedCommunities,
    status_code=status.HTTP_200_OK,
    summary="Get communities in user's university"
)
async def list_communities(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: dict = Depends(require_university_student),
    db: AsyncSession = Depends(get_db)
):
    # Fetch communities ONLY for user's university
    uni_uuid = uuid.UUID(current_user["university_id"])
    
    items, total = await get_communities(
        db=db,
        university_id=uni_uuid,
        page=page,
        size=size
    )
    
    return PaginatedCommunities(
        items=items,
        total=total,
        page=page,
        size=size
    )
