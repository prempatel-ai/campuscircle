"""
Authentication and security utility functions for password hashing and JWT management.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from jose import jwt, JWTError, ExpiredSignatureError
from passlib.context import CryptContext

from src.config import settings

# Setup CryptContext for password hashing using bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthError(Exception):
    """Base class for all authentication and token errors."""
    pass


class TokenExpiredError(AuthError):
    """Raised when a token has expired."""
    pass


class TokenInvalidError(AuthError):
    """Raised when a token is invalid (bad signature, wrong type, or malformed)."""
    pass


def hash_password(password: str) -> str:
    """
    Hash a plaintext password using bcrypt.
    
    Bcrypt automatically generates a unique salt for every hash operation, 
    so calling this function twice on the same password will result in 
    different output hashes.
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plaintext password against a hashed password.
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: Any, university_id: Any, role: str, username: str = "") -> str:
    """
    Generate an access JWT containing user information and an expiration claim.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "university_id": str(university_id),
        "username": username,
        "role": role,
        "type": "access",
        "exp": expire,
    }
    
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> Dict[str, Any]:
    """
    Verify the access token signature and expiration, and return the payload.
    
    Raises TokenExpiredError if the token has expired.
    Raises TokenInvalidError if the token is invalid or does not have access type.
    """
    try:
        payload = jwt.decode(
            token, 
            settings.jwt_secret, 
            algorithms=[settings.jwt_algorithm]
        )
        
        if payload.get("type") != "access":
            raise TokenInvalidError("Invalid token type. Expected access token.")
            
        if not payload.get("sub") or not payload.get("user_id"):
            raise TokenInvalidError("Malformed token payload. Missing subject or user ID.")
            
        return payload
        
    except ExpiredSignatureError as e:
        raise TokenExpiredError("Access token has expired.") from e
    except JWTError as e:
        raise TokenInvalidError("Invalid access token.") from e


def generate_verification_token(user_id: Any) -> str:
    """
    Generate a separate short-lived (24 hour) signed token for email verification.
    """
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    
    to_encode = {
        "sub": str(user_id),
        "type": "verification",
        "exp": expire,
    }
    
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_verification_token(token: str) -> str:
    """
    Verify the email verification token and return the extracted user ID.
    
    Raises TokenExpiredError if the token has expired.
    Raises TokenInvalidError if the token is invalid or does not have verification type.
    """
    try:
        payload = jwt.decode(
            token, 
            settings.jwt_secret, 
            algorithms=[settings.jwt_algorithm]
        )
        
        if payload.get("type") != "verification":
            raise TokenInvalidError("Invalid token type. Expected verification token.")
            
        user_id = payload.get("sub")
        if not user_id:
            raise TokenInvalidError("Malformed token payload. Missing subject.")
            
        return user_id
        
    except ExpiredSignatureError as e:
        raise TokenExpiredError("Verification token has expired.") from e
    except JWTError as e:
        raise TokenInvalidError("Invalid verification token.") from e
