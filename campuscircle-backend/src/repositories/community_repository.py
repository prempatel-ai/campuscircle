import uuid
from typing import List, Tuple, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from src.models.community import Community


class DuplicateCommunityError(Exception):
    """Raised when a community name already exists in the same university."""
    pass


async def create_community(
    db: AsyncSession,
    university_id: uuid.UUID,
    created_by: uuid.UUID,
    name: str,
    description: Optional[str] = None
) -> Community:
    """
    Create a new community in the specified university.
    If a community with the same name already exists in this university, 
    raises DuplicateCommunityError.
    """
    community = Community(
        university_id=university_id,
        created_by=created_by,
        name=name,
        description=description
    )
    
    db.add(community)
    try:
        await db.flush()  # populate community.id and trigger UniqueConstraint check
    except IntegrityError as e:
        await db.rollback()
        error_str = str(e)
        if e.orig:
            error_str += f" {e.orig}"
            
        if "uq_community_university_name" in error_str:
            raise DuplicateCommunityError(
                f"A community named '{name}' already exists in this university."
            ) from e
        raise e
        
    await db.commit()
    return community


async def get_communities(
    db: AsyncSession,
    university_id: uuid.UUID,
    page: int = 1,
    size: int = 20
) -> Tuple[List[Community], int]:
    """
    Retrieve a paginated list of communities belonging ONLY to the specified university_id.
    Returns a tuple containing: (list of communities, total count of communities).
    """
    # Enforce positive values for pagination
    if page < 1:
        page = 1
    if size < 1:
        size = 20
        
    # Query total count
    count_stmt = select(func.count(Community.id)).where(Community.university_id == university_id)
    count_result = await db.execute(count_stmt)
    total_count = count_result.scalar_one() or 0
    
    # Query items
    stmt = (
        select(Community)
        .where(Community.university_id == university_id)
        .order_by(Community.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    items = list(result.scalars().all())
    
    return items, total_count
