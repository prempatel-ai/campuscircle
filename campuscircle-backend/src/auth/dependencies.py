from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from src.auth.security import decode_access_token, TokenExpiredError, TokenInvalidError

# HTTPBearer extracts the "Authorization: Bearer <token>" header.
# We set auto_error=False so we can manually raise a 401 rather than FastAPI's default 403.
oauth2_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(oauth2_scheme)
) -> dict:
    """
    FastAPI dependency to extract and validate the current user from the JWT access token.
    Returns a dictionary containing: user_id, university_id, and role.
    Raises 401 Unauthorized if the token is invalid, expired, or missing.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Missing Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        return {
            "user_id": payload.get("user_id"),
            "university_id": payload.get("university_id"),
            "role": payload.get("role"),
        }
    except (TokenExpiredError, TokenInvalidError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


async def require_university_student(current_user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency to enforce that the logged-in user belongs to a university.
    Raises 403 Forbidden if the user's university_id is None.
    """
    uni_id = current_user.get("university_id")
    if not uni_id or uni_id == "None":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A verified university email is required to access this community feature."
        )
    return current_user


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency to enforce that the logged-in user has the "admin" role.
    Raises 403 Forbidden if the user's role is not "admin".
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required."
        )
    return current_user
