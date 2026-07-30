from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth.dependencies import get_current_user
from src.services.reva_service import generate_reva_chat_response

router = APIRouter(prefix="/reva", tags=["reva"])


class ChatMessageItem(BaseModel):
    sender: str = Field(..., description="'user' or 'bot'")
    text: str = Field(..., description="Message content")


class RevaChatRequest(BaseModel):
    message: str = Field(..., description="User's query for Reva AI")
    history: Optional[List[ChatMessageItem]] = Field(default_factory=list, description="Recent message history")


class RevaChatResponse(BaseModel):
    reply: str
    context_posts_count: int


@router.post("/chat", response_model=RevaChatResponse, status_code=status.HTTP_200_OK, summary="Chat with Reva AI platform agent")
async def chat_with_reva(
    payload: RevaChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not payload.message.strip():
        raise HTTPException(400, "Message cannot be empty.")

    history_dicts = [{"sender": item.sender, "text": item.text} for item in payload.history or []]

    result = await generate_reva_chat_response(
        user_message=payload.message.strip(),
        conversation_history=history_dicts,
        db=db
    )

    return RevaChatResponse(
        reply=result["reply"],
        context_posts_count=result["context_posts_count"]
    )
