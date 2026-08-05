"""
dashboard_service.py
Aggregates learning dashboard data purely from DB records.
No AI calls are made here — fast, cacheable, safe to call on every page load.
"""
import uuid
from typing import List
from collections import defaultdict

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.student_learning_profile import StudentLearningProfile
from src.models.user_learning_memory import UserLearningMemory
from src.models.user_concept_gap import UserConceptGap
from src.schemas.learn import LearningDashboardOut, SubjectMasteryItem, RecentActivityItem
from src.services.learning_profile_service import get_or_create_learning_profile


async def get_learning_dashboard(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> LearningDashboardOut:
    """
    Build a complete LearningDashboardOut for the given user.
    All data is read from stored DB records — zero AI calls.
    """
    # 1. Student Learning Profile (create if missing for brand-new users)
    profile: StudentLearningProfile = await get_or_create_learning_profile(db, user_id)

    # 2. All learning memories ordered newest first
    memories_stmt = (
        select(UserLearningMemory)
        .where(UserLearningMemory.user_id == user_id)
        .order_by(UserLearningMemory.completed_at.desc())
    )
    memories_res = await db.execute(memories_stmt)
    memories: List[UserLearningMemory] = list(memories_res.scalars().all())

    # 3. Subject mastery — aggregate avg quiz score per subject_category
    subject_buckets: dict[str, list[float]] = defaultdict(list)
    for mem in memories:
        if mem.subject_category and mem.quiz_score is not None and mem.quiz_score > 0:
            subject_buckets[mem.subject_category].append(mem.quiz_score)

    subject_mastery: List[SubjectMasteryItem] = []
    for subject, scores in sorted(subject_buckets.items(), key=lambda x: -sum(x[1]) / len(x[1])):
        avg = round(sum(scores) / len(scores), 1)
        subject_mastery.append(SubjectMasteryItem(
            subject=subject,
            mastery_percent=avg,
            sessions_count=len(scores),
        ))

    if not subject_mastery and profile.avg_quiz_score > 0:
        subject_mastery.append(SubjectMasteryItem(
            subject="Computer Science",
            mastery_percent=round(profile.avg_quiz_score, 1),
            sessions_count=profile.topics_completed or profile.total_sessions or 1,
        ))

    # Overall mastery = weighted avg across all non-zero memory scores, falling back to profile.avg_quiz_score
    non_zero_scores = [mem.quiz_score for mem in memories if mem.quiz_score is not None and mem.quiz_score > 0]
    if non_zero_scores:
        overall_mastery = round(sum(non_zero_scores) / len(non_zero_scores), 1)
    elif profile.avg_quiz_score > 0:
        overall_mastery = round(profile.avg_quiz_score, 1)
    else:
        overall_mastery = 0.0

    # 4. Recent activity — last 7 memories
    recent_raw = memories[:7]
    recent_activity: List[RecentActivityItem] = [
        RecentActivityItem(
            topic_title=m.topic_title,
            subject_category=m.subject_category or "General",
            quiz_score=m.quiz_score,
            mastery_level=m.mastery_level or "Novice",
            completed_at=m.completed_at,
        )
        for m in recent_raw
    ]

    # 5. Top concept gaps by miss_count
    gaps_stmt = (
        select(UserConceptGap.concept_category)
        .where(UserConceptGap.user_id == user_id)
        .order_by(UserConceptGap.miss_count.desc())
        .limit(5)
    )
    gaps_res = await db.execute(gaps_stmt)
    top_gaps: List[str] = list(gaps_res.scalars().all())

    return LearningDashboardOut(
        total_sessions=profile.total_sessions,
        total_study_time_seconds=profile.total_study_time_seconds,
        topics_completed=profile.topics_completed,
        avg_quiz_score=round(profile.avg_quiz_score, 1),
        highest_quiz_score=round(profile.highest_quiz_score, 1),
        current_streak_days=profile.current_streak_days,
        career_goal=profile.career_goal,
        strong_concepts=profile.strong_concepts or [],
        weak_concepts=profile.weak_concepts or [],
        subject_mastery=subject_mastery,
        overall_mastery_percent=overall_mastery,
        recent_activity=recent_activity,
        top_concept_gaps=top_gaps,
    )
