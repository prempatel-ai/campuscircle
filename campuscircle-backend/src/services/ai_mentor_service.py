import json
import uuid
from typing import Optional, List
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.learning_session import LearningSession
from src.models.user_concept_gap import UserConceptGap
from src.services.learning_profile_service import get_or_create_learning_profile
from src.services.learning_memory_service import get_relevant_memories_for_topic
from src.schemas.learn import PreSessionMentorOut, PostSessionMentorOut


async def generate_presession_mentor_guidance(
    db: AsyncSession,
    user_id: uuid.UUID
) -> PreSessionMentorOut:
    """
    Generates concise, personalized pre-session guidance (2-4 sentences) from profile, memories, and gaps.
    """
    profile = await get_or_create_learning_profile(db, user_id)

    # 1. Onboarding for brand new students
    if profile.total_sessions == 0:
        goal_text = f" aiming for {profile.career_goal}" if profile.career_goal else ""
        return PreSessionMentorOut(
            greeting="Welcome to CampusCircle Learn!",
            mentor_message=f"I'm Reva, your personal AI learning mentor{goal_text}. Paste a YouTube link or study notes below, and I'll break it down into interactive story chapters and adaptive quiz challenges!",
            suggested_next_topic="Python in 100 Seconds",
            career_goal=profile.career_goal,
            streak_days=0
        )

    # 2. Fetch student memory and concept gap context
    memories = await get_relevant_memories_for_topic(db=db, user_id=user_id, current_topic_title="", limit=3)
    
    gaps_stmt = (
        select(UserConceptGap.concept_category)
        .where(UserConceptGap.user_id == user_id)
        .order_by(UserConceptGap.miss_count.desc())
        .limit(3)
    )
    gaps_res = await db.execute(gaps_stmt)
    weak_concepts = list(gaps_res.scalars().all())

    # Fallback default if LLM fails or API key not set
    fallback_topic = weak_concepts[0] if weak_concepts else "Data Structures & Algorithms"
    fallback = PreSessionMentorOut(
        greeting=f"Welcome back! {profile.current_streak_days}-Day Streak",
        mentor_message=f"You've completed {profile.total_sessions} learning sessions! "
                       f"{'Focusing on ' + profile.career_goal + '. ' if profile.career_goal else ''}"
                       f"{'Let\'s strengthen ' + weak_concepts[0] + ' today.' if weak_concepts else 'Ready for your next topic?'}",
        suggested_next_topic=fallback_topic,
        career_goal=profile.career_goal,
        streak_days=profile.current_streak_days
    )

    if not settings.groq_api_key:
        return fallback

    # Call Groq AI for dynamic, highly personalized mentor message
    system_prompt = (
        "You are Reva, a supportive, warm, and actionable AI mentor for college students. "
        "Generate a short pre-session mentor greeting (2-4 sentences max). "
        "Return a JSON object with keys: 'greeting', 'mentor_message', 'suggested_next_topic'."
    )
    user_context = (
        f"Student Profile:\n"
        f"- Career Goal: {profile.career_goal or 'General Learning'}\n"
        f"- Learning Streak: {profile.current_streak_days} days\n"
        f"- Total Sessions: {profile.total_sessions}\n"
        f"- Weak Concept Gaps: {', '.join(weak_concepts) if weak_concepts else 'None'}\n"
        f"- Recent Memories: {'; '.join(memories) if memories else 'None'}\n\n"
        "Generate a warm 2-4 sentence mentor encouragement and suggest a relevant next topic."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_context},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.6,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = json.loads(res.json()["choices"][0]["message"]["content"])
                return PreSessionMentorOut(
                    greeting=data.get("greeting", fallback.greeting),
                    mentor_message=data.get("mentor_message", fallback.mentor_message),
                    suggested_next_topic=data.get("suggested_next_topic", fallback.suggested_next_topic),
                    career_goal=profile.career_goal,
                    streak_days=profile.current_streak_days
                )
    except Exception:
        pass

    return fallback


async def generate_postsession_mentor_summary(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID
) -> PostSessionMentorOut:
    """
    Generates personalized post-session feedback (3-6 sentences) analyzing performance and next steps.
    """
    profile = await get_or_create_learning_profile(db, user_id)

    # Fetch session data
    stmt = select(LearningSession).where(LearningSession.id == session_id, LearningSession.user_id == user_id)
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()

    if not session:
        return PostSessionMentorOut(
            summary_message="Great job completing your study session! Keep up the consistent effort.",
            strengths=["Consistent Practice"],
            needs_practice=[],
            suggested_next_topic="Advanced Applications"
        )

    progress = session.user_progress or {}
    completed = progress.get("is_completed", False)
    p1_score = progress.get("phase1_score", 0.0)
    p2_score = progress.get("phase2_score", 0.0)
    p3_score = progress.get("phase3_score", 0.0)

    fallback = PostSessionMentorOut(
        summary_message=f"Outstanding work on '{session.video_title}'! "
                        f"{'You completed all 3 phases successfully.' if completed else 'Keep practicing to unlock remaining phases.'} "
                        f"Your overall learning streak is now {profile.current_streak_days} days.",
        strengths=["Core Concepts", "Recall Memory"],
        needs_practice=["Synthesis & Trade-offs"] if not completed else [],
        suggested_next_topic=f"Advanced {session.video_title[:30]}"
    )

    if not settings.groq_api_key:
        return fallback

    system_prompt = (
        "You are Reva, a supportive AI mentor. Generate a 3-6 sentence post-session summary "
        "celebrating progress, highlighting strengths, identifying areas needing practice, and recommending a next topic. "
        "Return JSON with keys: 'summary_message', 'strengths' (list of strings), 'needs_practice' (list of strings), 'suggested_next_topic'."
    )
    user_context = (
        f"Topic: '{session.video_title}'\n"
        f"Career Goal: {profile.career_goal or 'General Learning'}\n"
        f"Phase 1 Score: {p1_score}%\n"
        f"Phase 2 Score: {p2_score}%\n"
        f"Phase 3 Score: {p3_score}%\n"
        f"Is Session Completed: {completed}\n\n"
        "Provide warm, constructive 3-6 sentence feedback."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_context},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.5,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = json.loads(res.json()["choices"][0]["message"]["content"])
                return PostSessionMentorOut(
                    summary_message=data.get("summary_message", fallback.summary_message),
                    strengths=data.get("strengths", fallback.strengths),
                    needs_practice=data.get("needs_practice", fallback.needs_practice),
                    suggested_next_topic=data.get("suggested_next_topic", fallback.suggested_next_topic)
                )
    except Exception:
        pass

    return fallback
