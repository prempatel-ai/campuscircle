import uuid
from datetime import datetime
from typing import List
from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: uuid.UUID
    recipient_id: uuid.UUID
    actor_id: uuid.UUID
    actor_username: str
    type: str
    target_id: uuid.UUID
    related_post_id: uuid.UUID
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedNotifications(BaseModel):
    items: List[NotificationOut]
    total: int
    page: int
    size: int


class UnreadCountOut(BaseModel):
    unread_count: int
