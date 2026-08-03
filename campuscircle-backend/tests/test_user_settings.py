import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from src.models.university import University
from src.models.community import Community
from src.models.user import User
from src.models.notification import Notification
from src.auth.security import hash_password, create_access_token
from src.repositories.auth_repository import create_refresh_token, validate_refresh_token


@pytest_asyncio.fixture
async def setup_test_env(db_session: AsyncSession):
    domain = f"testuni-{uuid.uuid4().hex[:6]}.edu"
    uni = University(name="Settings Test Uni", email_domain=domain)
    db_session.add(uni)
    await db_session.flush()

    pwd_hash = hash_password("password123!")
    user1 = User(
        university_id=uni.id,
        email=f"user1_{uuid.uuid4().hex[:4]}@{domain}",
        username=f"user1_{uuid.uuid4().hex[:4]}",
        password_hash=pwd_hash,
        email_verified=True,
        notifications_enabled=True
    )
    user2 = User(
        university_id=uni.id,
        email=f"user2_{uuid.uuid4().hex[:4]}@{domain}",
        username=f"user2_{uuid.uuid4().hex[:4]}",
        password_hash=pwd_hash,
        email_verified=True,
        notifications_enabled=True
    )
    db_session.add_all([user1, user2])
    await db_session.flush()

    comm = Community(
        university_id=uni.id,
        created_by=user1.id,
        name=f"comm_{uuid.uuid4().hex[:4]}",
        description="Test comm"
    )
    db_session.add(comm)
    await db_session.commit()

    token1 = create_access_token(user_id=user1.id, university_id=uni.id, role="student", username=user1.username)
    token2 = create_access_token(user_id=user2.id, university_id=uni.id, role="student", username=user2.username)

    yield {
        "uni": uni,
        "comm": comm,
        "user1": user1,
        "user2": user2,
        "token1": token1,
        "token2": token2,
        "password": "password123!"
    }

    await db_session.execute(delete(Community).where(Community.id == comm.id))
    await db_session.execute(delete(User).where(User.id.in_([user1.id, user2.id])))
    await db_session.execute(delete(University).where(University.id == uni.id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_my_profile(client: AsyncClient, setup_test_env: dict):
    user1 = setup_test_env["user1"]
    headers = {"Authorization": f"Bearer {setup_test_env['token1']}"}
    response = await client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == user1.username
    assert data["notifications_enabled"] is True
    assert data["is_deleted"] is False


@pytest.mark.asyncio
async def test_change_password(client: AsyncClient, setup_test_env: dict, db_session: AsyncSession):
    user1 = setup_test_env["user1"]
    headers = {"Authorization": f"Bearer {setup_test_env['token1']}"}

    active_token_1 = await create_refresh_token(db_session, user1.id)
    active_token_2 = await create_refresh_token(db_session, user1.id)

    # 1. Mismatch current password -> 400 Bad Request
    fail_res = await client.patch(
        "/api/v1/users/me/password",
        json={"current_password": "wrongpassword123", "new_password": "newpassword123!"},
        headers=headers
    )
    assert fail_res.status_code == 400

    # 2. Successful password change preserving active_token_1
    success_res = await client.patch(
        "/api/v1/users/me/password",
        json={
            "current_password": setup_test_env["password"],
            "new_password": "newpassword123!",
            "refresh_token": active_token_1
        },
        headers=headers
    )
    assert success_res.status_code == 200

    # Verify active_token_1 preserved, active_token_2 revoked
    res1 = await validate_refresh_token(db_session, active_token_1)
    res2 = await validate_refresh_token(db_session, active_token_2)
    assert res1 is not None
    assert res2 is None


@pytest.mark.asyncio
async def test_change_username_and_rate_limit(client: AsyncClient, setup_test_env: dict):
    user2 = setup_test_env["user2"]
    headers = {"Authorization": f"Bearer {setup_test_env['token1']}"}

    # 1. Duplicate username -> 409 Conflict
    dup_res = await client.patch(
        "/api/v1/users/me/username",
        json={"new_username": user2.username},
        headers=headers
    )
    assert dup_res.status_code == 409

    # 2. Successful username change
    new_uname = f"newname_{uuid.uuid4().hex[:4]}"
    ok_res = await client.patch(
        "/api/v1/users/me/username",
        json={"new_username": new_uname},
        headers=headers
    )
    assert ok_res.status_code == 200
    assert ok_res.json()["username"] == new_uname

    # 3. Rate limit enforcement (second change within 30 days) -> 400 Bad Request
    rate_res = await client.patch(
        "/api/v1/users/me/username",
        json={"new_username": "anothername_123"},
        headers=headers
    )
    assert rate_res.status_code == 400
    assert "once every 30 days" in rate_res.json()["detail"]


@pytest.mark.asyncio
async def test_notification_preferences_and_creation_skip(
    client: AsyncClient,
    setup_test_env: dict,
    db_session: AsyncSession
):
    comm = setup_test_env["comm"]
    user1 = setup_test_env["user1"]
    headers1 = {"Authorization": f"Bearer {setup_test_env['token1']}"}
    headers2 = {"Authorization": f"Bearer {setup_test_env['token2']}"}

    # User 1 posts
    post_res = await client.post(
        f"/api/v1/communities/{comm.id}/posts",
        json={"title": "Notification test post", "content": "Checking notification skip logic!"},
        headers=headers1
    )
    assert post_res.status_code == 201
    post_id = post_res.json()["id"]

    # User 1 disables notifications
    notif_res = await client.patch(
        "/api/v1/users/me/notifications",
        json={"notifications_enabled": False},
        headers=headers1
    )
    assert notif_res.status_code == 200
    assert notif_res.json()["notifications_enabled"] is False

    # User 2 comments on User 1's post
    comment_res = await client.post(
        f"/api/v1/posts/{post_id}/comments",
        json={"content": "Awesome discussion!"},
        headers=headers2
    )
    assert comment_res.status_code == 201

    # Verify NO notification row was created for User 1
    stmt = select(Notification).where(Notification.recipient_id == user1.id)
    res = await db_session.execute(stmt)
    notifs = res.scalars().all()
    assert len(notifs) == 0


@pytest.mark.asyncio
async def test_save_and_unsave_post(client: AsyncClient, setup_test_env: dict):
    comm = setup_test_env["comm"]
    headers = {"Authorization": f"Bearer {setup_test_env['token1']}"}

    # Create post
    post_res = await client.post(
        f"/api/v1/communities/{comm.id}/posts",
        json={"title": "Save & Unsave Post Test", "content": "Testing bookmark endpoints"},
        headers=headers
    )
    post_id = post_res.json()["id"]

    # 1. Save post
    save_res = await client.post(f"/api/v1/posts/{post_id}/save", headers=headers)
    assert save_res.status_code == 200
    assert save_res.json()["is_bookmarked"] is True

    # 2. Unsave post
    unsave_res = await client.delete(f"/api/v1/posts/{post_id}/save", headers=headers)
    assert unsave_res.status_code == 200
    assert unsave_res.json()["is_bookmarked"] is False


@pytest.mark.asyncio
async def test_account_soft_delete(client: AsyncClient, setup_test_env: dict):
    comm = setup_test_env["comm"]
    user1 = setup_test_env["user1"]
    headers1 = {"Authorization": f"Bearer {setup_test_env['token1']}"}
    headers2 = {"Authorization": f"Bearer {setup_test_env['token2']}"}

    # User 1 creates post before deleting account
    post_res = await client.post(
        f"/api/v1/communities/{comm.id}/posts",
        json={"title": "Post by user to be deleted", "content": "Should render as [deleted]"},
        headers=headers1
    )
    post_id = post_res.json()["id"]

    # 1. Soft-delete with wrong password -> 400 Bad Request
    fail_del = await client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": "wrongpassword!"},
        headers=headers1
    )
    assert fail_del.status_code == 400

    # 2. Soft-delete with correct password
    ok_del = await client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": setup_test_env["password"]},
        headers=headers1
    )
    assert ok_del.status_code == 200

    # 3. Future login attempt fails -> 401 Unauthorized
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": user1.email, "password": setup_test_env["password"]}
    )
    assert login_res.status_code == 401

    # 4. Verify post author username displays as "[deleted]" when retrieved by User 2
    get_post_res = await client.get(f"/api/v1/posts/{post_id}", headers=headers2)
    assert get_post_res.status_code == 200
    assert get_post_res.json()["author_username"] == "[deleted]"
