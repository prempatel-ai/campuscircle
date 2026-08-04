import uuid
from typing import List
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.learning_session import LearningSession
from src.models.lesson_chat_message import LessonChatMessage
from src.models.user_concept_gap import UserConceptGap
from src.services.learning_profile_service import get_or_create_learning_profile
from src.services.learning_memory_service import get_relevant_memories_for_topic


async def get_lesson_chat_messages(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID
) -> List[LessonChatMessage]:
    """
    Retrieve chronologically sorted lesson chat history for a session.
    Verifies session ownership.
    """
    # Verify session ownership
    sess_stmt = select(LearningSession.id).where(LearningSession.id == session_id, LearningSession.user_id == user_id)
    sess_res = await db.execute(sess_stmt)
    if not sess_res.scalar_one_or_none():
        raise ValueError("Learning session not found.")

    stmt = (
        select(LessonChatMessage)
        .where(LessonChatMessage.session_id == session_id, LessonChatMessage.user_id == user_id)
        .order_by(LessonChatMessage.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def post_lesson_chat_message(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    user_text: str
) -> LessonChatMessage:
    """
    Process user follow-up question, assemble lesson context, query AI, store history, and return Reva's response.
    """
    # 1. Fetch learning session
    sess_stmt = select(LearningSession).where(LearningSession.id == session_id, LearningSession.user_id == user_id)
    sess_res = await db.execute(sess_stmt)
    session = sess_res.scalar_one_or_none()
    if not session:
        raise ValueError("Learning session not found.")

    # 2. Persist user question message
    user_msg = LessonChatMessage(
        session_id=session_id,
        user_id=user_id,
        sender="user",
        content=user_text.strip()
    )
    db.add(user_msg)
    await db.flush()

    # 3. Retrieve student learning profile & weak concept gaps
    profile = await get_or_create_learning_profile(db, user_id)

    gaps_stmt = (
        select(UserConceptGap.concept_category)
        .where(UserConceptGap.user_id == user_id)
        .order_by(UserConceptGap.miss_count.desc())
        .limit(3)
    )
    gaps_res = await db.execute(gaps_stmt)
    weak_concepts = list(gaps_res.scalars().all())

    # 4. Retrieve top relevant past memories
    memories = await get_relevant_memories_for_topic(db=db, user_id=user_id, current_topic_title=session.video_title, limit=2)

    # 5. Fetch last 10 previous messages (excluding the current user question just added)
    history_stmt = (
        select(LessonChatMessage)
        .where(
            LessonChatMessage.session_id == session_id,
            LessonChatMessage.user_id == user_id,
            LessonChatMessage.id != user_msg.id
        )
        .order_by(LessonChatMessage.created_at.desc())
        .limit(10)
    )
    history_res = await db.execute(history_stmt)
    past_messages = list(reversed(history_res.scalars().all()))

    # Build concise summary of explanation text
    explanation_summary = ""
    if session.explanation_chunks and isinstance(session.explanation_chunks, dict):
        chunks = session.explanation_chunks.get("chunks", [])
        explanation_summary = " ".join([c.get("content", "") for c in chunks[:3]])[:1200]
    elif session.transcript:
        explanation_summary = session.transcript[:1000]

    # Build AI prompt array
    goal_str = profile.career_goal or "General Computer Science"
    system_prompt = (
        f"You are Reva, a world-class AI learning mentor on CampusCircle. "
        f"The student's career learning goal is '{goal_str}'. "
        f"Answer their follow-up question about the current lesson clearly, directly, and concisely. "
        f"Tailor your explanation to their career goal using relevant real-world analogies, code snippets, or interview insights when helpful. "
        f"\n\nLESSON CONTEXT:\n"
        f"Topic: {session.video_title}\n"
        f"Explanation Summary: {explanation_summary}\n"
        f"Student Weak Concepts: {', '.join(weak_concepts) if weak_concepts else 'None'}\n"
        f"Relevant Past Memory: {'; '.join(memories) if memories else 'None'}"
    )

    messages_payload = [{"role": "system", "content": system_prompt}]
    for msg in past_messages:
        role = "assistant" if msg.sender == "reva" else "user"
        messages_payload.append({"role": role, "content": msg.content})
    messages_payload.append({"role": "user", "content": user_text.strip()})

    # Default fallback
    reva_content = (
        f"Great question regarding '{session.video_title}'! "
        f"In relation to {goal_str}, this concept ensures structured, predictable logic. "
        f"Feel free to ask for code snippets or specific edge cases!"
    )

    if settings.groq_api_key:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
        payload = {
            "model": settings.groq_model,
            "messages": messages_payload,
            "temperature": 0.6,
            "max_tokens": 800,
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    response_data = res.json()
                    reva_content = response_data["choices"][0]["message"]["content"].strip()
        except Exception as err:
            print(f"[LessonChat AI Error]: {err}")

    # 6. Persist Reva's answer
    reva_msg = LessonChatMessage(
        session_id=session_id,
        user_id=user_id,
        sender="reva",
        content=reva_content
    )
    db.add(reva_msg)
    await db.commit()
    await db.refresh(reva_msg)

    return reva_msg
