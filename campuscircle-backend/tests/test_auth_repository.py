import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.models.university import University
from src.models.user import User
from src.models.refresh_token import RefreshToken
from src.repositories.auth_repository import (
    create_refresh_token,
    validate_refresh_token,
    revoke_refresh_token,
    revoke_all_for_user,
)


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession):
    """Fixture to create a test university and user, and clean them up afterward."""
    university = University(
        name="Test University",
        email_domain=f"test-{uuid.uuid4().hex[:6]}.edu"
    )
    db_session.add(university)
    await db_session.flush()
    
    user = User(
        university_id=university.id,
        email=f"user-{uuid.uuid4().hex[:6]}@test.edu",
        username=f"user_{uuid.uuid4().hex[:6]}",
        password_hash="somehashvalue",
        role="student"
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.commit()
    
    yield user
    
    # Cleanup: delete user first, then university (which cascades to refresh tokens)
    from sqlalchemy import delete
    await db_session.execute(delete(User).where(User.id == user.id))
    await db_session.execute(delete(University).where(University.id == university.id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_create_and_validate_refresh_token(db_session: AsyncSession, test_user: User):
    # 1. Create a refresh token
    raw_token = await create_refresh_token(db_session, test_user.id)
    assert isinstance(raw_token, str)
    assert len(raw_token) > 20
    
    # 2. Check that the raw token is NOT in the database, but a hash of it is
    stmt = select(RefreshToken).where(RefreshToken.user_id == test_user.id)
    result = await db_session.execute(stmt)
    db_tokens = result.scalars().all()
    assert len(db_tokens) == 1
    
    db_token = db_tokens[0]
    assert db_token.token_hash != raw_token
    assert len(db_token.token_hash) == 64  # SHA-256 hex digest is 64 chars
    assert db_token.revoked is False
    assert db_token.expires_at > datetime.now(timezone.utc)
    
    # 3. Validate the token
    user_id = await validate_refresh_token(db_session, raw_token)
    assert user_id == test_user.id


@pytest.mark.asyncio
async def test_validate_nonexistent_or_expired_or_revoked_token(db_session: AsyncSession, test_user: User):
    # Nonexistent token
    assert await validate_refresh_token(db_session, "nonexistent-token-value") is None
    
    # Revoked token
    raw_token = await create_refresh_token(db_session, test_user.id)
    await revoke_refresh_token(db_session, raw_token)
    assert await validate_refresh_token(db_session, raw_token) is None
    
    # Expired token
    expired_raw_token = await create_refresh_token(db_session, test_user.id)
    # Manually update the expires_at to the past
    from src.repositories.auth_repository import _hash_token
    token_hash = _hash_token(expired_raw_token)
    
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    result = await db_session.execute(stmt)
    db_token = result.scalar_one()
    db_token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    await db_session.flush()
    
    assert await validate_refresh_token(db_session, expired_raw_token) is None


@pytest.mark.asyncio
async def test_revoke_all_for_user(db_session: AsyncSession, test_user: User):
    # Create two refresh tokens
    raw1 = await create_refresh_token(db_session, test_user.id)
    raw2 = await create_refresh_token(db_session, test_user.id)
    
    # Validate they are both valid
    assert await validate_refresh_token(db_session, raw1) == test_user.id
    assert await validate_refresh_token(db_session, raw2) == test_user.id
    
    # Revoke all for user
    await revoke_all_for_user(db_session, test_user.id)
    
    # Check that they are both invalid
    assert await validate_refresh_token(db_session, raw1) is None
    assert await validate_refresh_token(db_session, raw2) is None
