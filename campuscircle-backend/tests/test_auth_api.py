import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.models.university import University
from src.models.user import User


@pytest_asyncio.fixture
async def test_university(db_session: AsyncSession) -> University:
    """
    Fixture to create a test university and guarantee it is cleaned up 
    along with any users created under it.
    """
    domain = f"mit-{uuid.uuid4().hex[:6]}.edu"
    university = University(
        name="Test MIT",
        email_domain=domain
    )
    db_session.add(university)
    await db_session.flush()
    await db_session.commit()
    
    yield university
    
    # Teardown: Delete all users under this university, then the university
    from sqlalchemy import delete
    await db_session.execute(delete(User).where(User.university_id == university.id))
    await db_session.execute(delete(University).where(University.id == university.id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_signup_success(client: AsyncClient, db_session: AsyncSession, test_university: University):
    signup_data = {
        "email": f"alice@{test_university.email_domain}",
        "username": f"alice_{uuid.uuid4().hex[:6]}",
        "password": "supersecretpassword123"
    }
    
    response = await client.post("/api/v1/auth/signup", json=signup_data)
    assert response.status_code == 201
    
    data = response.json()
    assert "user_id" in data
    assert data["message"] == "Verification email sent"
    assert "password" not in data  # Acceptance Criteria: Password never in response
    assert "password_hash" not in data
    
    # Verify database state
    user_id = uuid.UUID(data["user_id"])
    stmt = select(User).where(User.id == user_id)
    result = await db_session.execute(stmt)
    user = result.scalar_one()
    
    assert user.email == signup_data["email"]
    assert user.username == signup_data["username"]
    assert user.email_verified is False  # Constraint: Do not auto-verify user
    assert user.password_hash != signup_data["password"]  # Hashed


@pytest.mark.asyncio
async def test_signup_unsupported_domain(client: AsyncClient, db_session: AsyncSession):
    unsupported_email = f"bob@unsupported-{uuid.uuid4().hex[:6]}.edu"
    signup_data = {
        "email": unsupported_email,
        "username": "bob_unsupported",
        "password": "supersecretpassword123"
    }
    
    response = await client.post("/api/v1/auth/signup", json=signup_data)
    assert response.status_code == 400
    assert "not associated with any supported university" in response.json()["detail"]
    
    # Verify no user was created
    stmt = select(User).where(User.email == unsupported_email)
    result = await db_session.execute(stmt)
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_signup_duplicate_email(client: AsyncClient, db_session: AsyncSession, test_university: University):
    username1 = f"alice_{uuid.uuid4().hex[:6]}"
    username2 = f"bob_{uuid.uuid4().hex[:6]}"
    email = f"shared@{test_university.email_domain}"
    
    # Sign up the first user
    signup_data1 = {
        "email": email,
        "username": username1,
        "password": "supersecretpassword123"
    }
    response1 = await client.post("/api/v1/auth/signup", json=signup_data1)
    assert response1.status_code == 201
    
    # Try signing up with the same email
    signup_data2 = {
        "email": email,
        "username": username2,
        "password": "anothersecretpassword123"
    }
    response2 = await client.post("/api/v1/auth/signup", json=signup_data2)
    assert response2.status_code == 409
    assert "email address already exists" in response2.json()["detail"]


@pytest.mark.asyncio
async def test_signup_duplicate_username(client: AsyncClient, db_session: AsyncSession, test_university: University):
    username = f"shared_{uuid.uuid4().hex[:6]}"
    email1 = f"user1@{test_university.email_domain}"
    email2 = f"user2@{test_university.email_domain}"
    
    # Sign up the first user
    signup_data1 = {
        "email": email1,
        "username": username,
        "password": "supersecretpassword123"
    }
    response1 = await client.post("/api/v1/auth/signup", json=signup_data1)
    assert response1.status_code == 201
    
    # Try signing up with the same username
    signup_data2 = {
        "email": email2,
        "username": username,
        "password": "anothersecretpassword123"
    }
    response2 = await client.post("/api/v1/auth/signup", json=signup_data2)
    assert response2.status_code == 409
    assert "username is already taken" in response2.json()["detail"]


@pytest.mark.asyncio
async def test_verify_email_success(client: AsyncClient, db_session: AsyncSession, test_university: University):
    from src.auth.security import generate_verification_token
    
    # 1. Register a user
    signup_data = {
        "email": f"verify_success@{test_university.email_domain}",
        "username": f"user_{uuid.uuid4().hex[:6]}",
        "password": "supersecretpassword123"
    }
    signup_response = await client.post("/api/v1/auth/signup", json=signup_data)
    assert signup_response.status_code == 201
    user_id = uuid.UUID(signup_response.json()["user_id"])
    
    # Verify user starts as unverified
    stmt = select(User).where(User.id == user_id)
    user_db = (await db_session.execute(stmt)).scalar_one()
    assert user_db.email_verified is False
    
    # 2. Generate a verification token
    token = generate_verification_token(user_id)
    
    # 3. Call verification endpoint
    verify_response = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert verify_response.status_code == 200
    assert verify_response.json()["message"] == "Email verified successfully."
    
    # Refresh DB session & check state
    await db_session.commit()
    user_db = (await db_session.execute(stmt)).scalar_one()
    assert user_db.email_verified is True


@pytest.mark.asyncio
async def test_verify_email_expired(client: AsyncClient, db_session: AsyncSession, test_university: University):
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from src.config import settings
    
    # 1. Register a user
    signup_data = {
        "email": f"verify_expired@{test_university.email_domain}",
        "username": f"user_{uuid.uuid4().hex[:6]}",
        "password": "supersecretpassword123"
    }
    signup_response = await client.post("/api/v1/auth/signup", json=signup_data)
    assert signup_response.status_code == 201
    user_id = uuid.UUID(signup_response.json()["user_id"])
    
    # 2. Create an expired token manually
    expired_time = datetime.now(timezone.utc) - timedelta(hours=2)
    to_encode = {
        "sub": str(user_id),
        "type": "verification",
        "exp": expired_time,
    }
    expired_token = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    # 3. Call verification endpoint
    verify_response = await client.post("/api/v1/auth/verify-email", json={"token": expired_token})
    assert verify_response.status_code == 400
    assert "expired" in verify_response.json()["detail"].lower()
    
    # Verify user is still unverified in DB
    stmt = select(User).where(User.id == user_id)
    user_db = (await db_session.execute(stmt)).scalar_one()
    assert user_db.email_verified is False


@pytest.mark.asyncio
async def test_verify_email_tampered(client: AsyncClient, db_session: AsyncSession, test_university: University):
    from src.auth.security import generate_verification_token
    
    # 1. Register a user
    signup_data = {
        "email": f"verify_tampered@{test_university.email_domain}",
        "username": f"user_{uuid.uuid4().hex[:6]}",
        "password": "supersecretpassword123"
    }
    signup_response = await client.post("/api/v1/auth/signup", json=signup_data)
    assert signup_response.status_code == 201
    user_id = uuid.UUID(signup_response.json()["user_id"])
    
    # 2. Get verification token and tamper with it
    token = generate_verification_token(user_id)
    tampered_token = token + "tampered"
    
    # 3. Call verification endpoint
    verify_response = await client.post("/api/v1/auth/verify-email", json={"token": tampered_token})
    assert verify_response.status_code == 400
    assert "invalid" in verify_response.json()["detail"].lower()
    
    # Verify user is still unverified in DB
    stmt = select(User).where(User.id == user_id)
    user_db = (await db_session.execute(stmt)).scalar_one()
    assert user_db.email_verified is False


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, db_session: AsyncSession, test_university: University):
    email = f"login_success@{test_university.email_domain}"
    password = "supersecretpassword123"
    username = f"user_{uuid.uuid4().hex[:6]}"
    
    # 1. Sign up
    signup_res = await client.post("/api/v1/auth/signup", json={
        "email": email,
        "username": username,
        "password": password
    })
    assert signup_res.status_code == 201
    user_id = uuid.UUID(signup_res.json()["user_id"])
    
    # 2. Verify email
    stmt = select(User).where(User.id == user_id)
    user = (await db_session.execute(stmt)).scalar_one()
    user.email_verified = True
    await db_session.commit()
    
    # 3. Login
    login_res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["token_type"] == "bearer"
    assert password not in token_data  # Constraint: Never log/expose plaintext password


@pytest.mark.asyncio
async def test_login_unverified_email(client: AsyncClient, db_session: AsyncSession, test_university: University):
    email = f"login_unverified@{test_university.email_domain}"
    password = "supersecretpassword123"
    username = f"user_{uuid.uuid4().hex[:6]}"
    
    # 1. Sign up (email_verified defaults to False)
    signup_res = await client.post("/api/v1/auth/signup", json={
        "email": email,
        "username": username,
        "password": password
    })
    assert signup_res.status_code == 201
    
    # 2. Login (should fail with 403)
    login_res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 403
    assert "verify your email" in login_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_banned_user(client: AsyncClient, db_session: AsyncSession, test_university: University):
    email = f"login_banned@{test_university.email_domain}"
    password = "supersecretpassword123"
    username = f"user_{uuid.uuid4().hex[:6]}"
    
    # 1. Sign up
    signup_res = await client.post("/api/v1/auth/signup", json={
        "email": email,
        "username": username,
        "password": password
    })
    assert signup_res.status_code == 201
    user_id = uuid.UUID(signup_res.json()["user_id"])
    
    # 2. Verify email and ban user
    stmt = select(User).where(User.id == user_id)
    user = (await db_session.execute(stmt)).scalar_one()
    user.email_verified = True
    user.is_banned = True
    await db_session.commit()
    
    # 3. Login (should fail with 403)
    login_res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 403
    assert "banned" in login_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient, test_university: University):
    # 1. Try logging in with random credentials
    login_res = await client.post("/api/v1/auth/login", json={
        "email": f"nonexistent@{test_university.email_domain}",
        "password": "wrongpassword"
    })
    assert login_res.status_code == 401
    assert "invalid email or password" in login_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_refresh_success(client: AsyncClient, db_session: AsyncSession, test_university: University):
    email = f"refresh_success@{test_university.email_domain}"
    password = "supersecretpassword123"
    username = f"user_{uuid.uuid4().hex[:6]}"
    
    # Sign up, verify email, and login
    signup_res = await client.post("/api/v1/auth/signup", json={
        "email": email,
        "username": username,
        "password": password
    })
    user_id = uuid.UUID(signup_res.json()["user_id"])
    stmt = select(User).where(User.id == user_id)
    user = (await db_session.execute(stmt)).scalar_one()
    user.email_verified = True
    await db_session.commit()
    
    login_res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    tokens = login_res.json()
    refresh_token = tokens["refresh_token"]
    
    # Call /refresh
    refresh_res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 200
    refresh_data = refresh_res.json()
    assert "access_token" in refresh_data
    assert refresh_data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_refresh_revoked(client: AsyncClient, db_session: AsyncSession, test_university: University):
    email = f"refresh_revoked@{test_university.email_domain}"
    password = "supersecretpassword123"
    username = f"user_{uuid.uuid4().hex[:6]}"
    
    # Sign up, verify, and login
    signup_res = await client.post("/api/v1/auth/signup", json={
        "email": email,
        "username": username,
        "password": password
    })
    user_id = uuid.UUID(signup_res.json()["user_id"])
    stmt = select(User).where(User.id == user_id)
    user = (await db_session.execute(stmt)).scalar_one()
    user.email_verified = True
    await db_session.commit()
    
    login_res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    refresh_token = login_res.json()["refresh_token"]
    
    # Revoke it manually in DB
    from src.repositories.auth_repository import _hash_token
    from src.models.refresh_token import RefreshToken
    token_hash = _hash_token(refresh_token)
    stmt_token = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    db_token = (await db_session.execute(stmt_token)).scalar_one()
    db_token.revoked = True
    await db_session.commit()
    
    # Call refresh (should be rejected)
    refresh_res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 401
    assert "invalid or expired" in refresh_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_logout_success(client: AsyncClient, db_session: AsyncSession, test_university: University):
    email = f"logout_success@{test_university.email_domain}"
    password = "supersecretpassword123"
    username = f"user_{uuid.uuid4().hex[:6]}"
    
    # Sign up, verify, and login
    signup_res = await client.post("/api/v1/auth/signup", json={
        "email": email,
        "username": username,
        "password": password
    })
    user_id = uuid.UUID(signup_res.json()["user_id"])
    stmt = select(User).where(User.id == user_id)
    user = (await db_session.execute(stmt)).scalar_one()
    user.email_verified = True
    await db_session.commit()
    
    login_res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    refresh_token = login_res.json()["refresh_token"]
    
    # Logout
    logout_res = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
    assert logout_res.status_code == 200
    assert "logged out" in logout_res.json()["message"].lower()
    
    # Try calling refresh with the same token (should be rejected)
    refresh_res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 401


@pytest.mark.asyncio
async def test_login_failed_attempts_rate_limit(client: AsyncClient, test_university: University):
    target_email = f"target_ratelimit_{uuid.uuid4().hex[:6]}@{test_university.email_domain}"
    
    # Perform 10 failed login attempts (limit is 10)
    for i in range(10):
        res = await client.post("/api/v1/auth/login", json={
            "email": target_email,
            "password": "wrongpassword123"
        })
        assert res.status_code == 401

    # 11th failed attempt must return HTTP 429 Too Many Requests
    res_11th = await client.post("/api/v1/auth/login", json={
        "email": target_email,
        "password": "wrongpassword123"
    })
    assert res_11th.status_code == 429
    assert "rate limit exceeded" in res_11th.json()["detail"].lower()
