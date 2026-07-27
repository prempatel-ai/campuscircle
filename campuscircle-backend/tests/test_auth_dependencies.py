import uuid
import pytest
from datetime import datetime, timedelta, timezone
from jose import jwt
from fastapi import Depends
from httpx import AsyncClient

from src.main import app
from src.config import settings
from src.auth.dependencies import get_current_user, require_admin
from src.auth.security import create_access_token


# Register test endpoints directly on the app instance for testing the dependencies.
# These will be active during pytest runs when this module is imported.
@app.get("/_test/protected-user")
async def route_protected_user(current_user: dict = Depends(get_current_user)):
    return {"status": "ok", "user": current_user}


@app.get("/_test/protected-admin")
async def route_protected_admin(admin_user: dict = Depends(require_admin)):
    return {"status": "ok", "admin": admin_user}


@pytest.mark.asyncio
async def test_protected_user_no_token(client: AsyncClient):
    # 1. No Authorization header -> 401
    response = await client.get("/_test/protected-user")
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]


@pytest.mark.asyncio
async def test_protected_user_invalid_token(client: AsyncClient):
    # 2. Invalid/tampered token -> 401
    headers = {"Authorization": "Bearer invalid_token_value_here"}
    response = await client.get("/_test/protected-user", headers=headers)
    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_protected_user_expired_token(client: AsyncClient):
    # 3. Expired token -> 401
    user_id = uuid.uuid4()
    university_id = uuid.uuid4()
    
    # Manually encode an expired token
    expired_time = datetime.now(timezone.utc) - timedelta(minutes=10)
    to_encode = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "university_id": str(university_id),
        "role": "student",
        "type": "access",
        "exp": expired_time,
    }
    expired_token = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    headers = {"Authorization": f"Bearer {expired_token}"}
    response = await client.get("/_test/protected-user", headers=headers)
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_protected_user_valid_token(client: AsyncClient):
    # 4. Valid token -> 200 with user data
    user_id = uuid.uuid4()
    university_id = uuid.uuid4()
    token = create_access_token(user_id=user_id, university_id=university_id, role="student")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = await client.get("/_test/protected-user", headers=headers)
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "ok"
    assert data["user"]["user_id"] == str(user_id)
    assert data["user"]["university_id"] == str(university_id)
    assert data["user"]["role"] == "student"


@pytest.mark.asyncio
async def test_protected_admin_as_student(client: AsyncClient):
    # 5. Non-admin role accessing admin endpoint -> 403
    user_id = uuid.uuid4()
    university_id = uuid.uuid4()
    token = create_access_token(user_id=user_id, university_id=university_id, role="student")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = await client.get("/_test/protected-admin", headers=headers)
    assert response.status_code == 403
    assert "admin permissions required" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_protected_admin_success(client: AsyncClient):
    # 6. Admin role accessing admin endpoint -> 200
    user_id = uuid.uuid4()
    university_id = uuid.uuid4()
    token = create_access_token(user_id=user_id, university_id=university_id, role="admin")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = await client.get("/_test/protected-admin", headers=headers)
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "ok"
    assert data["admin"]["role"] == "admin"
