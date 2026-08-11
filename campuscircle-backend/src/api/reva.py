import uuid
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.api.learn import ai_endpoint_limiter
from src.auth.dependencies import get_current_user
from src.services.reva_service import generate_reva_chat_response
from src.models.conversation import Conversation
from src.models.chat_message import ChatMessage
from src.schemas.reva import (
    ConversationOut,
    ConversationListOut,
    ConversationDetailOut,
    MessageOut,
    SendMessageRequest,
    SendMessageResponse,
)

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


def _generate_title_from_message(message: str) -> str:
    msg = message.strip()
    prefixes = [
        "explain ", "what is ", "what are ", "tell me about ",
        "how do i ", "how to ", "help me ", "can you ",
        "write ", "create ", "show me ", "define ",
    ]
    for p in prefixes:
        if msg.lower().startswith(p):
            msg = msg[len(p):].strip()
            break
    title = msg[:60].strip().rstrip(".,;: ")
    if title:
        return title[0].upper() + title[1:]
    return "Campus Discussion"


# ── Existing chat endpoint (kept for backward compatibility) ──

@router.post("/chat", response_model=RevaChatResponse, status_code=status.HTTP_200_OK, summary="Chat with Reva AI platform agent")
async def chat_with_reva(
    payload: RevaChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not payload.message.strip():
        raise HTTPException(400, "Message cannot be empty.")
    
    user_uuid_str = str(current_user.get("user_id", current_user.get("id")))
    if ai_endpoint_limiter.is_rate_limited(user_uuid_str):
        raise HTTPException(status_code=429, detail="Too many AI requests today. Please try again tomorrow.")
    ai_endpoint_limiter.record(user_uuid_str)

    history_dicts = [{"sender": item.sender, "text": item.text} for item in payload.history or []]

    result = await generate_reva_chat_response(
        user_message=payload.message.strip(),
        conversation_history=history_dicts,
        db=db,
        user_id=uuid.UUID(current_user["user_id"]) if "user_id" in current_user else None
    )

    return RevaChatResponse(
        reply=result["reply"],
        context_posts_count=result["context_posts_count"]
    )


# ── Conversation management endpoints ──

@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED, summary="Create a new conversation")
async def create_conversation(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])

    # If the user already has an empty conversation (0 messages), reuse it
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user_uuid)
        .order_by(Conversation.created_at.desc())
    )
    res = await db.execute(stmt)
    existing_convs = list(res.scalars().all())

    for c in existing_convs:
        count_stmt = select(func.count(ChatMessage.id)).where(ChatMessage.conversation_id == c.id)
        msg_count = (await db.execute(count_stmt)).scalar() or 0
        if msg_count == 0:
            return c

    conversation = Conversation(user_id=user_uuid, title="New Chat")
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("/conversations", response_model=ConversationListOut, status_code=status.HTTP_200_OK, summary="List current user's conversations")
async def list_conversations(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user_uuid)
        .order_by(Conversation.updated_at.desc())
    )
    res = await db.execute(stmt)
    all_convs = list(res.scalars().all())

    # Only include conversations that have at least 1 message
    items = []
    for c in all_convs:
        count_stmt = select(func.count(ChatMessage.id)).where(ChatMessage.conversation_id == c.id)
        msg_count = (await db.execute(count_stmt)).scalar() or 0
        if msg_count > 0:
            items.append(c)

    return ConversationListOut(items=items, total=len(items))


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailOut, status_code=status.HTTP_200_OK, summary="Get a conversation with its messages")
async def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    conv_uuid = uuid.UUID(conversation_id)

    conv_res = await db.execute(select(Conversation).where(Conversation.id == conv_uuid))
    conv = conv_res.scalar_one_or_none()
    if not conv or conv.user_id != user_uuid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")

    msg_stmt = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_uuid)
        .order_by(ChatMessage.created_at.asc())
    )
    msg_res = await db.execute(msg_stmt)
    messages = list(msg_res.scalars().all())

    return ConversationDetailOut(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=messages,
    )


@router.post("/conversations/{conversation_id}/messages", response_model=SendMessageResponse, status_code=status.HTTP_200_OK, summary="Send a message in a conversation")
async def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    if ai_endpoint_limiter.is_rate_limited(str(user_uuid)):
        raise HTTPException(status_code=429, detail="Too many AI requests today. Please try again tomorrow.")
    ai_endpoint_limiter.record(str(user_uuid))
    conv_uuid = uuid.UUID(conversation_id)

    conv_res = await db.execute(select(Conversation).where(Conversation.id == conv_uuid))
    conv = conv_res.scalar_one_or_none()
    if not conv or conv.user_id != user_uuid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")

    # Load existing messages for context
    msg_stmt = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_uuid)
        .order_by(ChatMessage.created_at.asc())
    )
    msg_res = await db.execute(msg_stmt)
    existing_messages = list(msg_res.scalars().all())
    existing_count = len(existing_messages)

    # Save user message
    user_message = ChatMessage(
        conversation_id=conv_uuid,
        role="user",
        content=payload.message,
    )
    db.add(user_message)
    await db.flush()
    await db.refresh(user_message)

    # Build conversation history for AI
    history_dicts = [
        {"sender": "user" if m.role == "user" else "bot", "text": m.content}
        for m in existing_messages
    ]

    # Generate AI response
    result = await generate_reva_chat_response(
        user_message=payload.message,
        conversation_history=history_dicts,
        db=db,
        user_id=user_uuid,
        user_university_id=uuid.UUID(current_user.get("university_id", "")) if current_user.get("university_id") else None,
    )

    # Save AI response
    reva_message = ChatMessage(
        conversation_id=conv_uuid,
        role="assistant",
        content=result["reply"],
    )
    if hasattr(reva_message, "visual_html"):
        setattr(reva_message, "visual_html", result.get("visual_html"))
        setattr(reva_message, "visual_title", result.get("visual_title"))
    db.add(reva_message)

    # Update title if title is currently default or empty
    new_title = None
    if not conv.title or conv.title.strip() in ("", "New Chat"):
        new_title = _generate_title_from_message(payload.message)
        conv.title = new_title
    else:
        new_title = conv.title

    conv.updated_at = func.now()
    await db.commit()
    await db.refresh(user_message)
    await db.refresh(reva_message)

    return SendMessageResponse(
        user_message=MessageOut.model_validate(user_message),
        reva_message=MessageOut.model_validate(reva_message),
        title=new_title,
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a conversation")
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    conv_uuid = uuid.UUID(conversation_id)

    conv_res = await db.execute(select(Conversation).where(Conversation.id == conv_uuid))
    conv = conv_res.scalar_one_or_none()
    if not conv or conv.user_id != user_uuid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found.")

    await db.delete(conv)
    await db.commit()
