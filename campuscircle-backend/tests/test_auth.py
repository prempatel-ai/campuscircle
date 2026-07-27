import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.models.university import University
from src.models.user import User


@pytest.mark.asyncio
async def test_signup_non_matching_email_domain_rejected(client: AsyncClient):
    """
    Test 3b: Signup with a non-matching email domain is rejected (400).
    """
    unsupported_email = f"user@unsupported-{uuid.uuid4().hex[:6]}.edu"
    signup_data = {
        "email": unsupported_email,
        "username": f"user_{uuid.uuid4().hex[:6]}",
        "password": "supersecretpassword123"
    }

    response = await client.post("/api/v1/auth/signup", json=signup_data)
    assert response.status_code == 400
    assert "not associated with any supported university" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_duplicate_email_and_username_signup_returns_409(client: AsyncClient, db_session: AsyncSession):
    """
    Test 3c: Duplicate email/username signup returns 409 Conflict.
    """
    domain = f"testuni-{uuid.uuid4().hex[:6]}.edu"
    uni = University(name="Test Uni", email_domain=domain)
    db_session.add(uni)
    await db_session.commit()

    shared_email = f"shared@{domain}"
    shared_username = f"username_{uuid.uuid4().hex[:6]}"

    # Initial successful signup
    res1 = await client.post("/api/v1/auth/signup", json={
        "email": shared_email,
        "username": shared_username,
        "password": "password123"
    })
    assert res1.status_code == 201

    # Duplicate email signup
    res_dup_email = await client.post("/api/v1/auth/signup", json={
        "email": shared_email,
        "username": f"other_user_{uuid.uuid4().hex[:6]}",
        "password": "password123"
    })
    assert res_dup_email.status_code == 409
    assert "email address already exists" in res_dup_email.json()["detail"].lower()

    # Duplicate username signup
    res_dup_user = await client.post("/api/v1/auth/signup", json={
        "email": f"other_email_{uuid.uuid4().hex[:6]}@{domain}",
        "username": shared_username,
        "password": "password123"
    })
    assert res_dup_user.status_code == 409
    assert "username is already taken" in res_dup_user.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_unverified_email_returns_403(client: AsyncClient, db_session: AsyncSession):
    """
    Test 3d: Login with unverified email returns 403 Forbidden.
    """
    domain = f"testuni-{uuid.uuid4().hex[:6]}.edu"
    uni = University(name="Test Uni", email_domain=domain)
    db_session.add(uni)
    await db_session.commit()

    email = f"unverified@{domain}"
    password = "password123"

    signup_res = await client.post("/api/v1/auth/signup", json={
        "email": email,
        "username": f"user_{uuid.uuid4().hex[:6]}",
        "password": password
    })
    assert signup_res.status_code == 201

    login_res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 403
    assert "verify your email" in login_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_refresh_token_rejected_after_logout(client: AsyncClient, db_session: AsyncSession):
    """
    Test 3f: Refresh token is rejected after logout (revocation works).
    """
    domain = f"testuni-{uuid.uuid4().hex[:6]}.edu"
    uni = University(name="Test Uni", email_domain=domain)
    db_session.add(uni)
    await db_session.commit()

    email = f"logoutuser@{domain}"
    password = "password123"

    signup_res = await client.post("/api/v1/auth/signup", json={
        "email": email,
        "username": f"user_{uuid.uuid4().hex[:6]}",
        "password": password
    })
    user_id = uuid.UUID(signup_res.json()["user_id"])

    # Verify email directly in DB
    user_db = (await db_session.execute(select(User).where(User.id == user_id))).scalar_one()
    user_db.email_verified = True
    await db_session.commit()

    # Login to obtain tokens
    login_res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 200
    refresh_token = login_res.json()["refresh_token"]

    # Logout
    logout_res = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
    assert logout_res.status_code == 200

    # Attempt to refresh using revoked token
    refresh_res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 401
    assert "invalid or expired" in refresh_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_rate_limiter_exceeding_threshold_returns_429(client: AsyncClient):
    """
    Test 3g: Rate limiter returns 429 after exceeding login attempt threshold.
    """
    target_email = f"bruteforce_target_{uuid.uuid4().hex[:6]}@test.edu"

    # 10 failed login attempts (limit is 10)
    for _ in range(10):
        res = await client.post("/api/v1/auth/login", json={
            "email": target_email,
            "password": "wrongpassword123"
        })
        assert res.status_code == 401

    # 11th attempt must return 429
    res_11th = await client.post("/api/v1/auth/login", json={
        "email": target_email,
        "password": "wrongpassword123"
    })
    assert res_11th.status_code == 429
    assert "rate limit exceeded" in res_11th.json()["detail"].lower()
