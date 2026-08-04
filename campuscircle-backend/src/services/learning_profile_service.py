import uuid
from datetime import datetime, timezone, timedelta
from typing import List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.models.student_learning_profile import StudentLearningProfile
from src.models.user_concept_gap import UserConceptGap
from src.models.learning_session import LearningSession


async def get_or_create_learning_profile(
    db: AsyncSession,
    user_id: uuid.UUID
) -> StudentLearningProfile:
    """
    Retrieves existing StudentLearningProfile or initializes a new one.
    """
    stmt = select(StudentLearningProfile).where(StudentLearningProfile.user_id == user_id)
    res = await db.execute(stmt)
    profile = res.scalar_one_or_none()
    if not profile:
        profile = StudentLearningProfile(
            user_id=user_id,
            total_sessions=0,
            total_study_time_seconds=0,
            topics_completed=0,
            topics_learning=0,
            avg_quiz_score=0.0,
            highest_quiz_score=0.0,
            total_quizzes_completed=0,
            strong_concepts=[],
            weak_concepts=[],
            preferred_language="en",
            current_streak_days=0,
            extra_data={}
        )
        db.add(profile)
        await db.flush()

    return profile


async def update_profile_on_explanation(
    db: AsyncSession,
    user_id: uuid.UUID,
    language: str,
    estimated_duration_seconds: int = 180
) -> StudentLearningProfile:
    """
    Automatically called when an explanation session is created/loaded.
    Updates sessions count, study time, language preference, streak, and topics_learning.
    """
    profile = await get_or_create_learning_profile(db, user_id)

    profile.total_sessions += 1
    profile.topics_learning += 1
    profile.total_study_time_seconds += estimated_duration_seconds
    if language:
        profile.preferred_language = language

    # Calculate streak based on UTC date difference
    now = datetime.now(timezone.utc)
    today = now.date()

    if profile.last_learning_date:
        last_date = profile.last_learning_date.date()
        days_diff = (today - last_date).days
        if days_diff == 1:
            profile.current_streak_days += 1
        elif days_diff > 1:
            profile.current_streak_days = 1
        # if days_diff == 0, keep current streak
    else:
        profile.current_streak_days = 1

    profile.last_learning_date = now
    await db.commit()
    await db.refresh(profile)
    return profile


async def update_profile_on_quiz_submission(
    db: AsyncSession,
    user_id: uuid.UUID,
    score_percent: float,
    phase: int,
    passed: bool,
    is_session_completed: bool
) -> StudentLearningProfile:
    """
    Automatically called whenever a student submits a quiz phase.
    Recalculates average quiz score, highest score, total quizzes, and completion count.
    """
    profile = await get_or_create_learning_profile(db, user_id)

    # 1. Highest quiz score update
    if score_percent > profile.highest_quiz_score:
        profile.highest_quiz_score = score_percent

    # 2. Total quizzes completed & Average score update
    prev_total = profile.total_quizzes_completed
    new_total = prev_total + 1
    profile.total_quizzes_completed = new_total

    profile.avg_quiz_score = round(
        ((profile.avg_quiz_score * prev_total) + score_percent) / new_total,
        1
    )

    # 3. Topic completion update if Phase 3 passed
    if is_session_completed and phase == 3 and passed:
        profile.topics_completed += 1
        if profile.topics_learning > 0:
            profile.topics_learning -= 1

    # 4. Sync concept mastery (weak & strong concepts)
    await _sync_concept_mastery(db, profile)

    await db.commit()
    await db.refresh(profile)
    return profile


async def _sync_concept_mastery(
    db: AsyncSession,
    profile: StudentLearningProfile
) -> None:
    """
    Helper to populate weak_concepts from UserConceptGap table and strong_concepts from zero-miss categories.
    """
    # Fetch user's top concept gaps (weak categories)
    gap_stmt = (
        select(UserConceptGap.concept_category)
        .where(UserConceptGap.user_id == profile.user_id)
        .order_by(UserConceptGap.miss_count.desc())
        .limit(10)
    )
    gap_res = await db.execute(gap_stmt)
    weak_categories = list(gap_res.scalars().all())

    profile.weak_concepts = weak_categories
    flag_modified(profile, "weak_concepts")

    # Fetch concept categories where user has passed quizzes and has 0 active gaps
    # (Select distinct concept categories from past completed sessions not in weak_categories)
    session_stmt = (
        select(LearningSession.quiz_data)
        .where(
            LearningSession.user_id == profile.user_id,
            LearningSession.quiz_data.is_not(None)
        )
    )
    session_res = await db.execute(session_stmt)
    all_quiz_data = session_res.scalars().all()

    extracted_categories = set()
    for qd in all_quiz_data:
        if isinstance(qd, dict) and "phases" in qd:
            phases = qd.get("phases", {})
            for p_key, p_val in phases.items():
                if isinstance(p_val, dict):
                    for q in p_val.get("questions", []):
                        cat = q.get("concept_category")
                        if cat and cat not in weak_categories:
                            extracted_categories.add(cat)

    profile.strong_concepts = list(extracted_categories)[:10]
    flag_modified(profile, "strong_concepts")


async def update_career_goal(
    db: AsyncSession,
    user_id: uuid.UUID,
    career_goal: str
) -> StudentLearningProfile:
    """
    Updates the student's primary career learning goal.
    """
    profile = await get_or_create_learning_profile(db, user_id)
    profile.career_goal = career_goal.strip()
    await db.commit()
    await db.refresh(profile)
    return profile

