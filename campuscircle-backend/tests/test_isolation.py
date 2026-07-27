import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.university import University
from src.models.user import User
from src.models.community import Community
from src.auth.security import create_access_token


@pytest.mark.asyncio
async def test_university_tenant_isolation_returns_404(client: AsyncClient, db_session: AsyncSession):
    """
    Highest-risk test (3a): University A user gets 404 (not 403, not 200)
    accessing University B's community/posts.
    """
    # 1. Create University A & University B
    uni_a = University(name="University A", email_domain=f"unia-{uuid.uuid4().hex[:6]}.edu")
    uni_b = University(name="University B", email_domain=f"unib-{uuid.uuid4().hex[:6]}.edu")
    db_session.add_all([uni_a, uni_b])
    await db_session.flush()

    # 2. Create User A (Uni A) and User B (Uni B)
    user_a = User(
        university_id=uni_a.id,
        email=f"user_a@{uni_a.email_domain}",
        username=f"user_a_{uuid.uuid4().hex[:6]}",
        password_hash="somehash",
        email_verified=True,
        role="student",
    )
    user_b = User(
        university_id=uni_b.id,
        email=f"user_b@{uni_b.email_domain}",
        username=f"user_b_{uuid.uuid4().hex[:6]}",
        password_hash="somehash",
        email_verified=True,
        role="student",
    )
    db_session.add_all([user_a, user_b])
    await db_session.flush()

    # 3. Create Community B under Uni B
    community_b = Community(
        university_id=uni_b.id,
        created_by=user_b.id,
        name=f"CS Club {uuid.uuid4().hex[:6]}",
        description="Uni B CS Club",
    )
    db_session.add(community_b)
    await db_session.commit()

    # 4. Generate Auth Token for User A (University A)
    token_a = create_access_token(
        user_id=user_a.id,
        university_id=user_a.university_id,
        role=user_a.role,
        username=user_a.username,
    )
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 5. User A attempts to fetch posts from University B's community
    response = await client.get(
        f"/api/v1/communities/{community_b.id}/posts",
        headers=headers_a
    )

    # 6. Expect 404 (not 403, not 200) to prevent tenant resource enumeration leakage
    assert response.status_code == 404
    assert response.status_code != 403
    assert response.status_code != 200
    assert "not found" in response.json()["detail"].lower()
