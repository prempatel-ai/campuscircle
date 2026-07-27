import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from src.models.university import University
from src.models.user import User
from src.models.community import Community
from src.models.post import Post
from src.repositories.post_repository import create_post
from src.auth.security import create_access_token


@pytest_asyncio.fixture
async def setup_universities(db_session: AsyncSession):
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
    
    from src.models.comment import Comment
    from src.models.notification import Notification

    await db_session.execute(delete(Notification).where(Notification.recipient_id.in_(
        select(User.id).where(User.university_id.in_([uni_a_id, uni_b_id]))
    )))
    await db_session.execute(delete(Comment).where(Comment.author_id.in_(
        select(User.id).where(User.university_id.in_([uni_a_id, uni_b_id]))
    )))
    await db_session.execute(delete(Post).where(Post.community_id.in_(
        select(Community.id).where(Community.university_id.in_([uni_a_id, uni_b_id]))
    )))
    await db_session.execute(delete(Community).where(Community.university_id.in_([uni_a_id, uni_b_id])))
    await db_session.execute(delete(User).where(User.university_id.in_([uni_a_id, uni_b_id])))
    await db_session.execute(delete(University).where(University.id.in_([uni_a_id, uni_b_id])))


@pytest.mark.asyncio
async def test_notifications_flow(
    client: AsyncClient,
    db_session: AsyncSession,
    setup_universities
):
    uni_a, _ = setup_universities

    # User A (Post Author), User B (Replier)
    user_a = User(
        username="author_a",
        email=f"author_a_{uuid.uuid4().hex[:6]}@unia.edu",
        password_hash="hashed_pw",
        university_id=uni_a.id,
        email_verified=True,
        role="student",
    )
    user_b = User(
        username="replier_b",
        email=f"replier_b_{uuid.uuid4().hex[:6]}@unia.edu",
        password_hash="hashed_pw",
        university_id=uni_a.id,
        email_verified=True,
        role="student",
    )
    db_session.add_all([user_a, user_b])
    await db_session.commit()

    comm = Community(name="Notif Comm", description="Test", university_id=uni_a.id, created_by=user_a.id)
    db_session.add(comm)
    await db_session.commit()

    # User A creates a post
    post_a_id = await create_post(db_session, comm.id, user_a.id, "User A Post", "Post Content")

    token_a = create_access_token(user_id=user_a.id, university_id=user_a.university_id, role=user_a.role, username=user_a.username)
    token_b = create_access_token(user_id=user_b.id, university_id=user_b.university_id, role=user_b.role, username=user_b.username)

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. User A replies to own post (Self-reply) -> 0 notifications created
    self_reply_res = await client.post(
        f"/api/v1/posts/{post_a_id}/comments",
        json={"content": "Self reply by author A"},
        headers=headers_a
    )
    assert self_reply_res.status_code == 201

    count_a_res1 = await client.get("/api/v1/notifications/unread-count", headers=headers_a)
    assert count_a_res1.status_code == 200
    assert count_a_res1.json()["unread_count"] == 0

    # 2. User B replies to User A's post -> Creates 1 notification for User A
    comment_b_res = await client.post(
        f"/api/v1/posts/{post_a_id}/comments",
        json={"content": "Great post User A!"},
        headers=headers_b
    )
    assert comment_b_res.status_code == 201
    comment_b = comment_b_res.json()

    # User A unread count is now 1
    count_a_res2 = await client.get("/api/v1/notifications/unread-count", headers=headers_a)
    assert count_a_res2.status_code == 200
    assert count_a_res2.json()["unread_count"] == 1

    # User A fetches notifications
    notifs_res = await client.get("/api/v1/notifications", headers=headers_a)
    assert notifs_res.status_code == 200
    notifs_data = notifs_res.json()
    assert notifs_data["total"] == 1
    notif = notifs_data["items"][0]
    assert notif["type"] == "reply_to_post"
    assert notif["actor_username"] == "replier_b"
    assert notif["is_read"] is False

    # 3. User A replies to User B's comment -> Creates 1 notification for User B
    comment_a_reply_res = await client.post(
        f"/api/v1/posts/{post_a_id}/comments",
        json={"content": "Thanks User B!", "parent_id": comment_b["id"]},
        headers=headers_a
    )
    assert comment_a_reply_res.status_code == 201

    # User B unread count is now 1
    count_b_res = await client.get("/api/v1/notifications/unread-count", headers=headers_b)
    assert count_b_res.status_code == 200
    assert count_b_res.json()["unread_count"] == 1

    notifs_b_res = await client.get("/api/v1/notifications", headers=headers_b)
    assert notifs_b_res.status_code == 200
    notif_b = notifs_b_res.json()["items"][0]
    assert notif_b["type"] == "reply_to_comment"
    assert notif_b["actor_username"] == "author_a"

    # 4. User A marks notification as read -> unread_count drops to 0
    notif_id = notif["id"]
    read_res = await client.post(f"/api/v1/notifications/{notif_id}/read", headers=headers_a)
    assert read_res.status_code == 200
    assert read_res.json()["is_read"] is True

    count_a_res3 = await client.get("/api/v1/notifications/unread-count", headers=headers_a)
    assert count_a_res3.status_code == 200
    assert count_a_res3.json()["unread_count"] == 0
