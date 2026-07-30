import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationListOut(BaseModel):
    items: List[ConversationOut]
    total: int


class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationDetailOut(ConversationOut):
    messages: List[MessageOut]


class SendMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User's message")


class SendMessageResponse(BaseModel):
    user_message: MessageOut
    reva_message: MessageOut
    title: Optional[str] = None
