"""
socratic_discussion_service.py

Socratic Follow-up Discussion Engine — runs after quiz completion.

Architecture:
  - Reuses lesson_chat_messages table with discussion_type='socratic'
  - Reuses LearningSession, StudentLearningProfile, UserLearningMemory
  - 3 public functions:
      start_socratic_discussion()    → Reva generates first Socratic question
      respond_to_socratic()          → Process student reply, evaluate, respond or conclude
      get_socratic_messages()        → Fetch the Socratic thread for a session
  - On conclusion: updates StudentLearningProfile.strong/weak_concepts
                   and UserLearningMemory.mastery_level
"""
import uuid
from typing import List, Optional, Tuple
import httpx
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.learning_session import LearningSession
from src.models.lesson_chat_message import LessonChatMessage
from src.models.student_learning_profile import StudentLearningProfile
from src.models.user_learning_memory import UserLearningMemory
from src.services.learning_profile_service import get_or_create_learning_profile

DISCUSSION_TYPE = "socratic"
MAX_SOCRATIC_EXCHANGES = 8   # ceiling — AI can conclude earlier naturally


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _fetch_session(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> LearningSession:
    res = await db.execute(
        select(LearningSession).where(
            LearningSession.id == session_id,
            LearningSession.user_id == user_id
        )
    )
    session = res.scalar_one_or_none()
    if not session:
        raise ValueError("Learning session not found.")
    return session


async def _count_socratic_exchanges(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> int:
    """Count how many user turns have already happened in this Socratic discussion."""
    res = await db.execute(
        select(LessonChatMessage).where(
            LessonChatMessage.session_id == session_id,
            LessonChatMessage.user_id == user_id,
            LessonChatMessage.discussion_type == DISCUSSION_TYPE,
            LessonChatMessage.sender == "user",
        )
    )
    return len(res.scalars().all())


def _build_opening_system_prompt(session: LearningSession, profile: StudentLearningProfile) -> str:
    goal = profile.career_goal or "General Computer Science"
    explanation_summary = ""
    if session.explanation_chunks and isinstance(session.explanation_chunks, dict):
        chunks = session.explanation_chunks.get("chunks", [])
        explanation_summary = " ".join(c.get("content", "") for c in chunks[:3])[:1500]

    quiz_context = ""
    if session.user_progress and isinstance(session.user_progress, dict):
        scores = []
        for phase in ["phase_1_result", "phase_2_result", "phase_3_result"]:
            p = session.user_progress.get(phase, {})
            if p:
                scores.append(f"Phase {phase[-7]}: {p.get('score_percent', 0):.0f}%")
        failed = [f for f in (session.user_progress.get("failed_concepts") or [])
                  if isinstance(f, str)]
        if scores:
            quiz_context += f"Quiz Scores: {', '.join(scores)}. "
        if failed:
            quiz_context += f"Concepts missed: {', '.join(failed[:4])}. "

    return (
        f"You are Reva, a Socratic AI mentor on CampusCircle. "
        f"The student has just completed an adaptive quiz on: '{session.video_title}'. "
        f"Their career goal is: {goal}.\n"
        f"\nLESSON CONTEXT:\n{explanation_summary}\n"
        f"\nQUIZ PERFORMANCE:\n{quiz_context or 'Completed the quiz.'}\n"
        f"\nYOUR ROLE:\n"
        f"Ask ONE concise Socratic question that probes whether the student truly understands "
        f"the concept (not just memorized answers). "
        f"Focus on WHY, HOW, or WHAT-IF reasoning. "
        f"Examples: 'Why does X work this way?', 'How would you explain Y to a friend?', "
        f"'What would change if assumption Z was removed?' "
        f"Ask only ONE question. Be warm and concise."
    )


def _build_response_system_prompt(
    session: LearningSession,
    profile: StudentLearningProfile,
    exchange_count: int,
) -> str:
    goal = profile.career_goal or "General Computer Science"
    return (
        f"You are Reva, a Socratic AI mentor. "
        f"The student is discussing: '{session.video_title}'. Career goal: {goal}.\n"
        f"This is exchange {exchange_count} of maximum {MAX_SOCRATIC_EXCHANGES}.\n"
        f"\nYOUR TASK:\n"
        f"1. Evaluate the student's response. Identify any misconceptions clearly but kindly.\n"
        f"2. If understanding is demonstrated: affirm it specifically and ask ONE deeper question "
        f"   OR conclude the discussion naturally (if {exchange_count} >= 4 and understanding is solid).\n"
        f"3. If misconception detected: gently explain it, then guide with another Socratic question.\n"
        f"4. If {exchange_count} >= {MAX_SOCRATIC_EXCHANGES}: wrap up gracefully, summarise what was learned.\n"
        f"\nIMPORTANT:\n"
        f"- Keep each response under 120 words.\n"
        f"- Evaluate reasoning, not just correctness.\n"
        f"- Use the EXACT token [CONCLUDE] at the start of your response ONLY when the discussion "
        f"  should end (naturally reached understanding, or exchange limit reached).\n"
        f"- After [CONCLUDE], write 2 sentences: one celebrating their understanding, one brief takeaway.\n"
        f"- Also add on a new line: LEVEL:<level> where level is one of: strong, adequate, developing, needs_review.\n"
    )


async def _call_groq(
    system_prompt: str,
    conversation: List[dict],
) -> str:
    fallback = (
        "That's a thoughtful perspective! "
        "Can you walk me through the core idea once more — in your own words, "
        "as if explaining it to someone who's never heard of it?"
    )

    if not settings.groq_api_key:
        return fallback

    messages = [{"role": "system", "content": system_prompt}] + conversation

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.groq_model,
                    "messages": messages,
                    "temperature": 0.6,
                    "max_tokens": 350,
                },
            )
            if res.status_code == 200:
                text = res.json()["choices"][0]["message"]["content"].strip()
                if text:
                    return text
    except Exception as err:
        print(f"[SocraticDiscussion AI Error]: {err}")

    return fallback


def _parse_conclude_response(raw: str) -> Tuple[bool, str, str]:
    """
    Returns (is_concluded, clean_content, understanding_level).
    Strips [CONCLUDE] token and extracts LEVEL: tag.
    """
    is_concluded = raw.startswith("[CONCLUDE]")
    content = raw.replace("[CONCLUDE]", "").strip()

    level = "adequate"
    lines = content.split("\n")
    filtered = []
    for line in lines:
        if line.strip().upper().startswith("LEVEL:"):
            raw_level = line.split(":", 1)[-1].strip().lower().replace(" ", "_")
            if raw_level in ("strong", "adequate", "developing", "needs_review"):
                level = raw_level
        else:
            filtered.append(line)
    content = "\n".join(filtered).strip()

    return is_concluded, content, level


async def _persist_update_on_conclusion(
    db: AsyncSession,
    session: LearningSession,
    user_id: uuid.UUID,
    understanding_level: str,
) -> None:
    """Update session, StudentLearningProfile, and UserLearningMemory on discussion conclusion."""
    # 1. Update session
    session.socratic_concluded = True
    session.socratic_understanding_level = understanding_level

    # 2. Update StudentLearningProfile strong/weak concepts
    profile = await get_or_create_learning_profile(db, user_id)
    topic = session.video_title

    if understanding_level == "strong":
        strong = list(profile.strong_concepts or [])
        if topic not in strong:
            strong.insert(0, topic)
        profile.strong_concepts = strong[:10]
    elif understanding_level == "needs_review":
        weak = list(profile.weak_concepts or [])
        if topic not in weak:
            weak.insert(0, topic)
        profile.weak_concepts = weak[:10]

    # 3. Update UserLearningMemory mastery_level if record exists
    mem_res = await db.execute(
        select(UserLearningMemory).where(
            UserLearningMemory.session_id == session.id,
            UserLearningMemory.user_id == user_id,
        )
    )
    memory = mem_res.scalar_one_or_none()
    if memory:
        level_map = {
            "strong": "Mastered",
            "adequate": "Proficient",
            "developing": "Developing",
            "needs_review": "Novice",
        }
        memory.mastery_level = level_map.get(understanding_level, memory.mastery_level)

    await db.commit()


# ─── Public API ───────────────────────────────────────────────────────────────

async def get_socratic_messages(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> List[LessonChatMessage]:
    """Fetch all Socratic discussion messages for a session in chronological order."""
    await _fetch_session(db, session_id, user_id)  # ownership check
    res = await db.execute(
        select(LessonChatMessage)
        .where(
            LessonChatMessage.session_id == session_id,
            LessonChatMessage.user_id == user_id,
            LessonChatMessage.discussion_type == DISCUSSION_TYPE,
        )
        .order_by(LessonChatMessage.created_at.asc())
    )
    return list(res.scalars().all())


async def start_socratic_discussion(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> LessonChatMessage:
    """
    Generate and store Reva's first Socratic question.
    Idempotent — if a first message already exists, returns it.
    """
    session = await _fetch_session(db, session_id, user_id)

    # Idempotent: return existing first message if already started
    existing = await get_socratic_messages(db, session_id, user_id)
    if existing:
        return existing[0]

    profile = await get_or_create_learning_profile(db, user_id)
    system_prompt = _build_opening_system_prompt(session, profile)

    ai_text = await _call_groq(
        system_prompt=system_prompt,
        conversation=[
            {
                "role": "user",
                "content": (
                    f"I've just completed the quiz on '{session.video_title}'. "
                    "Please start our Socratic discussion."
                )
            }
        ],
    )

    # Strip any errant [CONCLUDE] from the opening (shouldn't happen but defensive)
    _, clean_text, _ = _parse_conclude_response(ai_text)

    msg = LessonChatMessage(
        session_id=session_id,
        user_id=user_id,
        sender="reva",
        content=clean_text,
        discussion_type=DISCUSSION_TYPE,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def respond_to_socratic(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    student_text: str,
) -> dict:
    """
    Process student's response in the Socratic discussion.
    Returns:
        {
          "message": LessonChatMessage (Reva's reply),
          "is_concluded": bool,
          "understanding_level": str | None,
        }
    """
    session = await _fetch_session(db, session_id, user_id)

    # Don't allow more messages if already concluded
    if session.socratic_concluded:
        raise ValueError("This Socratic discussion has already concluded.")

    # 1. Persist student's message
    user_msg = LessonChatMessage(
        session_id=session_id,
        user_id=user_id,
        sender="user",
        content=student_text.strip(),
        discussion_type=DISCUSSION_TYPE,
    )
    db.add(user_msg)
    await db.flush()

    # 2. Build conversation history for the prompt
    all_messages = await get_socratic_messages(db, session_id, user_id)
    # Exclude the user_msg we just added (not committed yet) from history
    history = [
        {
            "role": "assistant" if m.sender == "reva" else "user",
            "content": m.content,
        }
        for m in all_messages
        if m.id != user_msg.id
    ]
    history.append({"role": "user", "content": student_text.strip()})

    # 3. Count exchanges for ceiling enforcement
    exchange_count = await _count_socratic_exchanges(db, session_id, user_id)

    profile = await get_or_create_learning_profile(db, user_id)
    system_prompt = _build_response_system_prompt(session, profile, exchange_count)

    # Force conclusion if at limit
    if exchange_count >= MAX_SOCRATIC_EXCHANGES:
        history.append({
            "role": "system",
            "content": f"You must conclude this discussion now. Use [CONCLUDE]."
        })

    raw_response = await _call_groq(system_prompt=system_prompt, conversation=history)
    is_concluded, clean_text, understanding_level = _parse_conclude_response(raw_response)

    # Also conclude if exchange ceiling is reached
    if exchange_count >= MAX_SOCRATIC_EXCHANGES:
        is_concluded = True

    # 4. Persist Reva's reply
    reva_msg = LessonChatMessage(
        session_id=session_id,
        user_id=user_id,
        sender="reva",
        content=clean_text,
        discussion_type=DISCUSSION_TYPE,
    )
    db.add(reva_msg)

    # 5. On conclusion — update profile, memory, session
    if is_concluded:
        await _persist_update_on_conclusion(db, session, user_id, understanding_level)
    else:
        await db.commit()

    await db.refresh(reva_msg)

    return {
        "message": reva_msg,
        "is_concluded": is_concluded,
        "understanding_level": understanding_level if is_concluded else None,
    }
