import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.university import University
from src.models.user import User
from src.models.community import Community
from src.models.post import Post
from src.auth.security import create_access_token


@pytest.mark.asyncio
async def test_vote_toggle_same_vote_twice_unvotes(client: AsyncClient, db_session: AsyncSession):
    """
    Test 3e: Vote toggle: same vote twice = un-vote (score returns to original).
    """
    # 1. Setup Uni, User, Community, Post
    uni = University(name="Vote Uni", email_domain=f"vote-{uuid.uuid4().hex[:6]}.edu")
    db_session.add(uni)
    await db_session.flush()

    user = User(
        university_id=uni.id,
        email=f"voter@{uni.email_domain}",
        username=f"voter_{uuid.uuid4().hex[:6]}",
        password_hash="somehash",
        email_verified=True,
        role="student",
    )
    db_session.add(user)
    await db_session.flush()

    community = Community(
        university_id=uni.id,
        created_by=user.id,
        name=f"Vote Community {uuid.uuid4().hex[:6]}",
        description="Voting test community",
    )
    db_session.add(community)
    await db_session.flush()

    post = Post(
        community_id=community.id,
        author_id=user.id,
        title="Test Post for Voting",
        content="Post content",
        score=0,
    )
    db_session.add(post)
    await db_session.commit()

    token = create_access_token(
        user_id=user.id,
        university_id=user.university_id,
        role=user.role,
        username=user.username,
    )
    headers = {"Authorization": f"Bearer {token}"}

    vote_payload = {
        "target_id": str(post.id),
        "target_type": "post",
        "value": 1,
    }

    # 2. First vote (+1)
    vote_res1 = await client.post("/api/v1/votes", json=vote_payload, headers=headers)
    assert vote_res1.status_code == 200
    data1 = vote_res1.json()
    assert data1["new_score"] == 1
    assert data1["user_vote"] == 1

    # 3. Second vote (+1 again) -> should toggle off (un-vote)
    vote_res2 = await client.post("/api/v1/votes", json=vote_payload, headers=headers)
    assert vote_res2.status_code == 200
    data2 = vote_res2.json()
    assert data2["new_score"] == 0  # Returned to original score
    assert data2["user_vote"] is None  # Vote removed
