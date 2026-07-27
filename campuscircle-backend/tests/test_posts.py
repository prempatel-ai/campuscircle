import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from src.models.university import University
from src.models.user import User
from src.models.community import Community
from src.models.post import Post
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
    
    # Teardown: Clean up posts, communities, users, and universities
    await db_session.execute(delete(Post).where(Post.community_id.in_(
        select(Community.id).where(Community.university_id.in_([uni_a_id, uni_b_id]))
    )))
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


@pytest_asyncio.fixture
async def community_a(db_session: AsyncSession, verified_user_a: User) -> Community:
    community = Community(
        university_id=verified_user_a.university_id,
        created_by=verified_user_a.id,
        name="Uni A Chat",
        description="A chat for Uni A"
    )
    db_session.add(community)
    await db_session.flush()
    await db_session.commit()
    return community


@pytest_asyncio.fixture
async def community_b(db_session: AsyncSession, verified_user_b: User) -> Community:
    community = Community(
        university_id=verified_user_b.university_id,
        created_by=verified_user_b.id,
        name="Uni B Chat",
        description="A chat for Uni B"
    )
    db_session.add(community)
    await db_session.flush()
    await db_session.commit()
    return community


@pytest.mark.asyncio
async def test_create_post_success(client: AsyncClient, verified_user_a: User, community_a: Community):
    token = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    payload = {
        "title": "Welcome to CampusCircle",
        "content": "This is our initial post test!"
    }
    
    response = await client.post(
        f"/api/v1/communities/{community_a.id}/posts", 
        json=payload, 
        headers=headers
    )
    assert response.status_code == 201
    
    data = response.json()
    assert "id" in data
    assert data["title"] == payload["title"]
    assert data["content"] == payload["content"]
    assert data["author_id"] == str(verified_user_a.id)
    assert data["community_id"] == str(community_a.id)
    # is_deleted is intentionally absent from the public schema
    assert "is_deleted" not in data
    # New enriched fields: real username from the joined User row
    assert data["author_username"] == verified_user_a.username
    # Brand-new post has no comments yet
    assert data["comment_count"] == 0


@pytest.mark.asyncio
async def test_post_creation_and_retrieval_isolation_failure(
    client: AsyncClient, 
    verified_user_a: User, 
    community_b: Community
):
    """
    Most important test: verified User A (Uni A) tries to post/read inside Community B (Uni B).
    Must return 404 for both cases.
    """
    token_a = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers_a = {"Authorization": f"Bearer {token_a}"}
    
    payload = {"title": "Malicious Post", "content": "I am in Uni A"}
    
    # 1. Attempt POST to Community B -> 404
    post_res = await client.post(
        f"/api/v1/communities/{community_b.id}/posts", 
        json=payload, 
        headers=headers_a
    )
    assert post_res.status_code == 404
    
    # 2. Attempt GET from Community B -> 404
    get_res = await client.get(
        f"/api/v1/communities/{community_b.id}/posts", 
        headers=headers_a
    )
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_get_posts_excludes_deleted(
    client: AsyncClient, 
    db_session: AsyncSession, 
    verified_user_a: User, 
    community_a: Community
):
    token = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create two posts in the DB
    post_active = Post(
        community_id=community_a.id,
        author_id=verified_user_a.id,
        title="Active Post",
        content="I am visible",
        is_deleted=False
    )
    post_deleted = Post(
        community_id=community_a.id,
        author_id=verified_user_a.id,
        title="Deleted Post",
        content="I am hidden",
        is_deleted=True
    )
    db_session.add_all([post_active, post_deleted])
    await db_session.flush()
    await db_session.commit()
    
    # GET posts
    response = await client.get(f"/api/v1/communities/{community_a.id}/posts", headers=headers)
    assert response.status_code == 200
    
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["title"] == "Active Post"


@pytest.mark.asyncio
async def test_get_posts_sorting(
    client: AsyncClient, 
    db_session: AsyncSession, 
    verified_user_a: User, 
    community_a: Community
):
    token = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role
    )
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create 3 posts with distinct scores and timestamps
    now = datetime.now(timezone.utc)
    p1 = Post(
        community_id=community_a.id,
        author_id=verified_user_a.id,
        title="Post 1",
        content="Score 5, created 2h ago",
        score=5,
        created_at=now - timedelta(hours=2)
    )
    p2 = Post(
        community_id=community_a.id,
        author_id=verified_user_a.id,
        title="Post 2",
        content="Score 10, created 1h ago",
        score=10,
        created_at=now - timedelta(hours=1)
    )
    p3 = Post(
        community_id=community_a.id,
        author_id=verified_user_a.id,
        title="Post 3",
        content="Score 1, created 3h ago",
        score=1,
        created_at=now - timedelta(hours=3)
    )
    db_session.add_all([p1, p2, p3])
    await db_session.flush()
    await db_session.commit()
    
    # 1. Sort by new: orders by created_at desc
    # Expected order: Post 2, Post 1, Post 3
    res_new = await client.get(
        f"/api/v1/communities/{community_a.id}/posts?sort=new", 
        headers=headers
    )
    assert res_new.status_code == 200
    new_items = res_new.json()["items"]
    assert new_items[0]["title"] == "Post 2"
    assert new_items[1]["title"] == "Post 1"
    assert new_items[2]["title"] == "Post 3"
    
    # 2. Sort by top: orders by score desc
    # Expected order: Post 2 (10), Post 1 (5), Post 3 (1)
    res_top = await client.get(
        f"/api/v1/communities/{community_a.id}/posts?sort=top", 
        headers=headers
    )
    assert res_top.status_code == 200
    top_items = res_top.json()["items"]
    assert top_items[0]["title"] == "Post 2"
    assert top_items[1]["title"] == "Post 1"
    assert top_items[2]["title"] == "Post 3"


@pytest.mark.asyncio
async def test_create_thread_and_feed_deduplication(
    client: AsyncClient,
    db_session: AsyncSession,
    verified_user_a: User,
    community_a: Community
):
    token = create_access_token(
        user_id=verified_user_a.id,
        university_id=verified_user_a.university_id,
        role=verified_user_a.role,
        username=verified_user_a.username,
    )
    headers = {"Authorization": f"Bearer {token}"}

    thread_payload = {
        "title": "Quantum Mechanics Deep Dive",
        "parts": [
            "Part 1: Introduction to wave-particle duality and historic background.",
            "Part 2: The Schrödinger equation and wave function collapse.",
            "Part 3: Practical applications in quantum computing and cryptography."
        ]
    }

    # 1. Create multi-part thread
    create_res = await client.post(
        f"/api/v1/communities/{community_a.id}/posts/thread",
        json=thread_payload,
        headers=headers
    )
    assert create_res.status_code == 201
    thread_items = create_res.json()
    assert len(thread_items) == 3
    
    # Assert all 3 parts share the same thread_id and have positions 1, 2, 3
    first_thread_id = thread_items[0]["thread_id"]
    assert first_thread_id is not None
    assert thread_items[1]["thread_id"] == first_thread_id
    assert thread_items[2]["thread_id"] == first_thread_id
    
    assert thread_items[0]["thread_position"] == 1
    assert thread_items[1]["thread_position"] == 2
    assert thread_items[2]["thread_position"] == 3
    assert thread_items[0]["thread_total_parts"] == 3

    # 2. Feed listing — must show ONLY part 1 in the feed list
    feed_res = await client.get(
        f"/api/v1/communities/{community_a.id}/posts",
        headers=headers
    )
    assert feed_res.status_code == 200
    feed_data = feed_res.json()
    feed_items = feed_data["items"]
    
    # Only part 1 appears in the feed
    assert len(feed_items) == 1
    assert feed_items[0]["title"] == "Quantum Mechanics Deep Dive"
    assert feed_items[0]["thread_position"] == 1
    assert feed_items[0]["thread_total_parts"] == 3

    # 3. GET .../thread — returns all 3 parts in order
    part1_id = thread_items[0]["id"]
    thread_res = await client.get(
        f"/api/v1/posts/{part1_id}/thread",
        headers=headers
    )
    assert thread_res.status_code == 200
    parts_data = thread_res.json()
    assert len(parts_data) == 3
    assert parts_data[0]["thread_position"] == 1
    assert parts_data[1]["thread_position"] == 2
    assert parts_data[2]["thread_position"] == 3
