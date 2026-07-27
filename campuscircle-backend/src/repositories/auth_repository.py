import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.refresh_token import RefreshToken


def _hash_token(raw_token: str) -> str:
    """
    Compute SHA-256 hash of a raw token string.
    Since refresh tokens have high entropy, SHA-256 is extremely fast and secure.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def create_refresh_token(db: AsyncSession, user_id: Any) -> str:
    """
    Generate a new raw refresh token, store its hash in the database, and return the raw token.
    """
    raw_token = secrets.token_urlsafe(64)
    token_hash = _hash_token(raw_token)
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    
    # Standardize user_id to a uuid.UUID object
    if isinstance(user_id, str):
        user_uuid = uuid.UUID(user_id)
    else:
        user_uuid = user_id
        
    db_token = RefreshToken(
        user_id=user_uuid,
        token_hash=token_hash,
        expires_at=expires_at
    )
    db.add(db_token)
    await db.commit()
    
    return raw_token


async def validate_refresh_token(db: AsyncSession, raw_token: str) -> Optional[uuid.UUID]:
    """
    Validate a raw refresh token by checking its hash, expiration, and revocation status.
    Returns the user_id if valid, otherwise None.
    """
    token_hash = _hash_token(raw_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    result = await db.execute(stmt)
    db_token = result.scalar_one_or_none()
    
    if not db_token:
        return None
        
    if db_token.revoked:
        return None
        
    # Compare timezone-aware expires_at with current timezone-aware UTC datetime
    now = datetime.now(timezone.utc)
    if db_token.expires_at <= now:
        return None
        
    return db_token.user_id


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    """
    Revoke a single refresh token by its raw token value.
    """
    token_hash = _hash_token(raw_token)
    stmt = update(RefreshToken).where(RefreshToken.token_hash == token_hash).values(revoked=True)
    await db.execute(stmt)
    await db.commit()


async def revoke_all_for_user(db: AsyncSession, user_id: Any) -> None:
    """
    Revoke all active refresh tokens for a user (e.g. for logout everywhere).
    """
    if isinstance(user_id, str):
        user_uuid = uuid.UUID(user_id)
    else:
        user_uuid = user_id
        
    stmt = (
        update(RefreshToken)
        .where(RefreshToken.user_id == user_uuid, RefreshToken.revoked == False)
        .values(revoked=True)
    )
    await db.execute(stmt)
    await db.commit()
