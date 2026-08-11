import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, description="Current account password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")
    refresh_token: Optional[str] = Field(default=None, description="Optional refresh token of current session to preserve")


class ChangeUsernameRequest(BaseModel):
    new_username: str = Field(..., min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$", description="New username (alphanumeric & underscores)")


class UpdateNotificationsRequest(BaseModel):
    notifications_enabled: bool = Field(..., description="Enable or disable notification creation for this user")


class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1, description="Password confirmation for account deletion")


class UserProfileOut(BaseModel):
    id: uuid.UUID
    university_id: Optional[uuid.UUID] = None
    email: str
    username: str
    role: str
    notifications_enabled: bool
    is_deleted: bool
    last_username_change_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
