import uuid
import pytest
import datetime
from datetime import timedelta
from jose import jwt

from src.config import settings
from src.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    generate_verification_token,
    verify_verification_token,
    TokenExpiredError,
    TokenInvalidError,
)


def test_password_hashing():
    password = "SuperSecretPassword123"
    
    # 1. hash_password on the same input twice produces DIFFERENT hashes
    hash1 = hash_password(password)
    hash2 = hash_password(password)
    
    assert hash1 != hash2
    assert hash1.startswith("$2b$") or hash1.startswith("$2a$")
    
    # 2. verify_password confirms both match
    assert verify_password(password, hash1) is True
    assert verify_password(password, hash2) is True
    assert verify_password("WrongPassword", hash1) is False


def test_access_token_creation_and_decoding():
    user_id = uuid.uuid4()
    university_id = uuid.uuid4()
    role = "student"
    
    token = create_access_token(user_id=user_id, university_id=university_id, role=role)
    assert isinstance(token, str)
    
    payload = decode_access_token(token)
    
    assert payload["sub"] == str(user_id)
    assert payload["user_id"] == str(user_id)
    assert payload["university_id"] == str(university_id)
    assert payload["role"] == role
    assert payload["type"] == "access"
    assert "exp" in payload


def test_decode_access_token_expired():
    # Force a token with expired time
    user_id = uuid.uuid4()
    university_id = uuid.uuid4()
    role = "student"
    
    # We can temporarily mock/override settings or manually construct an expired token to test decode
    # Let's manually build an expired token using settings secret/algorithm to verify decode_access_token raises
    import datetime
    expired_time = datetime.datetime.now(datetime.timezone.utc) - timedelta(minutes=10)
    
    to_encode = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "university_id": str(university_id),
        "role": role,
        "type": "access",
        "exp": expired_time,
    }
    expired_token = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    with pytest.raises(TokenExpiredError):
        decode_access_token(expired_token)


def test_decode_access_token_invalid_type():
    user_id = uuid.uuid4()
    university_id = uuid.uuid4()
    role = "student"
    
    to_encode = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "university_id": str(university_id),
        "role": role,
        "type": "some_other_type",
        "exp": datetime.datetime.now(datetime.timezone.utc) + timedelta(minutes=10)
    }
    invalid_token = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    with pytest.raises(TokenInvalidError) as exc_info:
        decode_access_token(invalid_token)
    assert "Expected access token" in str(exc_info.value)


def test_decode_access_token_tampered():
    user_id = uuid.uuid4()
    university_id = uuid.uuid4()
    role = "student"
    
    token = create_access_token(user_id=user_id, university_id=university_id, role=role)
    tampered_token = token + "tampered"
    
    with pytest.raises(TokenInvalidError):
        decode_access_token(tampered_token)


def test_verification_token_flow():
    user_id = uuid.uuid4()
    
    token = generate_verification_token(user_id)
    assert isinstance(token, str)
    
    extracted_user_id = verify_verification_token(token)
    assert extracted_user_id == str(user_id)


def test_verify_verification_token_expired():
    user_id = uuid.uuid4()
    import datetime
    expired_time = datetime.datetime.now(datetime.timezone.utc) - timedelta(hours=1)
    
    to_encode = {
        "sub": str(user_id),
        "type": "verification",
        "exp": expired_time,
    }
    expired_token = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    with pytest.raises(TokenExpiredError):
        verify_verification_token(expired_token)


def test_verify_verification_token_invalid_type():
    user_id = uuid.uuid4()
    
    # Passing an access token to verify_verification_token should fail
    access_token = create_access_token(user_id=user_id, university_id=uuid.uuid4(), role="student")
    
    with pytest.raises(TokenInvalidError) as exc_info:
        verify_verification_token(access_token)
    assert "Expected verification token" in str(exc_info.value)
