import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from src.models.university import University
from src.models.user import User
from src.models.community import Community
from src.auth.security import create_access_token


@pytest_asyncio.fixture
async def setup_universities(db_session: AsyncSession):
    """
    Creates two test universities and cleans them up (and their cascaded data) 
    after the test runs.
    """
    uni_a = University(
        name="University A",
        email_domain=f"unia-{uuid.uuid4().hex[:6]}.edu"
    )
    uni_b = University(
        name="University B",
        email_domain=f"unib-{uuid.uuid4().hex[:6]}.edu"
    )
    db_session.add_all([uni_a, uni_b])
    await db_session.flush()
    await db_session.commit()
    
    uni_a_id = uni_a.id
    uni_b_id = uni_b.id
    
    yield uni_a, uni_b
    
    # Teardown: Clean up communities, users, and universities using stored IDs
    from sqlalchemy import delete
    await db_session.execute(delete(Community).where(Community.university_id.in_([uni_a_id, uni_b_id])))
    await db_session.execute(delete(User).where(User.university_id.in_([uni_a_id, uni_b_id])))
    await db_session.execute(delete(University).where(University.id.in_([uni_a_id, uni_b_id])))
    await db_session.commit()


@pytest_asyncio.fixture
async def verified_user_a(db_session: AsyncSession, setup_universities) -> User:
    uni_a, _ = setup_universities
    user = User(
        university_id=uni_a.id,
        email=f"user_a@{uni_a.email_domain}",
        username=f"user_a_{uuid.uuid4().hex[:4]}",
        password_hash="somehash",
        email_verified=True
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def verified_user_b(db_session: AsyncSession, setup_universities) -> User:
    _, uni_b = setup_universities
    user = User(
        university_id=uni_b.id,
        email=f"user_b@{uni_b.email_domain}",
        username=f"user_b_{uuid.uuid4().hex[:4]}",
        password_hash="somehash",
        email_verified=True
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_create_community_success(client: AsyncClient, verified_user_a: User):
    token = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    payload = {
        "name": "General Chat",
        "description": "General discussions for Uni A"
    }
    
    response = await client.post("/api/v1/communities", json=payload, headers=headers)
    assert response.status_code == 201
    
    data = response.json()
    assert "id" in data
    assert data["name"] == payload["name"]
    assert data["description"] == payload["description"]
    assert data["university_id"] == str(verified_user_a.university_id)
    assert data["created_by"] == str(verified_user_a.id)


@pytest.mark.asyncio
async def test_create_community_unverified_user(client: AsyncClient, db_session: AsyncSession, setup_universities):
    uni_a, _ = setup_universities
    unverified_user = User(
        university_id=uni_a.id,
        email=f"unverified@{uni_a.email_domain}",
        username=f"unverified_{uuid.uuid4().hex[:4]}",
        password_hash="somehash",
        email_verified=False
    )
    db_session.add(unverified_user)
    await db_session.flush()
    await db_session.commit()
    
    token = create_access_token(
        user_id=unverified_user.id,
        university_id=unverified_user.university_id,
        role=unverified_user.role
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    payload = {
        "name": "General Chat",
        "description": "General discussions"
    }
    
    response = await client.post("/api/v1/communities", json=payload, headers=headers)
    assert response.status_code == 403
    assert "verified" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_community_duplicate_name(client: AsyncClient, verified_user_a: User):
    token = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    payload = {"name": "Confessions", "description": "First"}
    
    # 1. First creation -> 201
    res1 = await client.post("/api/v1/communities", json=payload, headers=headers)
    assert res1.status_code == 201
    
    # 2. Second creation with same name -> 409
    res2 = await client.post("/api/v1/communities", json=payload, headers=headers)
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_community_ignores_university_id_in_payload(client: AsyncClient, verified_user_a: User):
    token = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    # Send a payload with a fake university ID
    fake_uni_id = str(uuid.uuid4())
    payload = {
        "name": "Ignored Uni ID Test",
        "description": "Silly description",
        "university_id": fake_uni_id
    }
    
    response = await client.post("/api/v1/communities", json=payload, headers=headers)
    assert response.status_code == 201
    
    data = response.json()
    # Acceptance Criteria: Sourced from token, NOT the request body
    assert data["university_id"] == str(verified_user_a.university_id)
    assert data["university_id"] != fake_uni_id


@pytest.mark.asyncio
async def test_create_community_rate_limit(client: AsyncClient, verified_user_a: User):
    token = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    # Reset/Clear rate limit history for the test user to avoid collision with other tests
    from src.api.communities import community_creation_limiter
    user_id_str = str(verified_user_a.id)
    community_creation_limiter.history[user_id_str].clear()
    
    # Create 5 communities successfully
    for i in range(5):
        payload = {"name": f"Rate Limit Community {i}", "description": f"Desc {i}"}
        res = await client.post("/api/v1/communities", json=payload, headers=headers)
        assert res.status_code == 201
        
    # The 6th community creation should fail (429)
    payload = {"name": "Too Many Community", "description": "Over limit"}
    res = await client.post("/api/v1/communities", json=payload, headers=headers)
    assert res.status_code == 429
    assert "rate limit exceeded" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_communities_university_isolation(
    client: AsyncClient, 
    verified_user_a: User, 
    verified_user_b: User
):
    # User A creates a community in University A
    token_a = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers_a = {"Authorization": f"Bearer {token_a}"}
    payload_a = {"name": "Community in Uni A"}
    await client.post("/api/v1/communities", json=payload_a, headers=headers_a)
    
    # User B creates a community in University B
    token_b = create_access_token(
        user_id=verified_user_b.id,
        university_id=verified_user_b.university_id,
        role=verified_user_b.role
    )
    headers_b = {"Authorization": f"Bearer {token_b}"}
    payload_b = {"name": "Community in Uni B"}
    await client.post("/api/v1/communities", json=payload_b, headers=headers_b)
    
    # 1. User A retrieves communities -> Only returns Community in Uni A
    res_a = await client.get("/api/v1/communities", headers=headers_a)
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["total"] == 1
    assert data_a["items"][0]["name"] == "Community in Uni A"
    assert data_a["items"][0]["university_id"] == str(verified_user_a.university_id)
    
    # 2. User B retrieves communities -> Only returns Community in Uni B
    res_b = await client.get("/api/v1/communities", headers=headers_b)
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert data_b["total"] == 1
    assert data_b["items"][0]["name"] == "Community in Uni B"
    assert data_b["items"][0]["university_id"] == str(verified_user_b.university_id)


@pytest.mark.asyncio
async def test_create_community_other_integrity_error(db_session: AsyncSession, verified_user_a: User):
    from sqlalchemy.exc import IntegrityError
    from src.repositories.community_repository import create_community, DuplicateCommunityError
    
    # ForeignKey constraint violation triggers an IntegrityError.
    # This should be re-raised directly, rather than raising DuplicateCommunityError.
    fake_uni_id = uuid.uuid4()
    with pytest.raises(IntegrityError):
        await create_community(
            db=db_session,
            university_id=fake_uni_id,
            created_by=verified_user_a.id,
            name="Test Non-FK Community"
        )
