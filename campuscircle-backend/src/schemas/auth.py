from pydantic import BaseModel, Field, field_validator


class UserSignupRequest(BaseModel):
    """
    Pydantic schema for user registration requests.
    """
    email: str = Field(..., description="User's academic email address")
    username: str = Field(..., min_length=3, max_length=32, description="Unique username")
    password: str = Field(..., min_length=8, description="User's password")

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v:
            raise ValueError("Invalid email address format (missing @).")
        parts = v.split("@")
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError("Invalid email address format.")
        return v


class UserSignupResponse(BaseModel):
    """
    Pydantic schema for user registration response.
    """
    user_id: str
    message: str


class EmailVerificationRequest(BaseModel):
    """
    Pydantic schema for verifying email request.
    """
    token: str = Field(..., description="The email verification token.")


class EmailVerificationResponse(BaseModel):
    """
    Pydantic schema for email verification response.
    """
    message: str


class UserLoginRequest(BaseModel):
    """
    Pydantic schema for login request.
    """
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class TokenResponse(BaseModel):
    """
    Pydantic schema for access and refresh tokens.
    """
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefreshRequest(BaseModel):
    """
    Pydantic schema for token refresh request.
    """
    refresh_token: str = Field(..., description="The valid refresh token.")


class TokenRefreshResponse(BaseModel):
    """
    Pydantic schema for refresh token response (new access token).
    """
    access_token: str
    token_type: str = "bearer"


class LogoutRequest(BaseModel):
    """
    Pydantic schema for logout request.
    """
    refresh_token: str = Field(..., description="The refresh token to revoke.")


class LogoutResponse(BaseModel):
    """
    Pydantic schema for logout response.
    """
    message: str
