"""
weekly_report_service.py

Generates and retrieves weekly AI Learning Reports.

Strategy (lazy generation):
  - On request, check if a report for the current calendar week already exists.
  - If yes → return it immediately (no AI calls, no re-computation).
  - If no  → aggregate this week's data from DB, optionally call Groq for a
             narrative summary, persist, and return.

This satisfies "generate once per week, reuse thereafter" without any
background scheduler process.
"""
import json
import uuid
from datetime import datetime, timedelta, timezone, date
from typing import List, Optional

import httpx
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.user_learning_memory import UserLearningMemory
from src.models.user_concept_gap import UserConceptGap
from src.models.weekly_learning_report import WeeklyLearningReport
from src.schemas.learn import WeeklyLearningReportOut
from src.services.learning_profile_service import get_or_create_learning_profile


# ─── Week boundary helpers ────────────────────────────────────────────────────

def _current_week_bounds() -> tuple[date, date]:
    """Return (Monday, Sunday) for the current ISO calendar week (UTC)."""
    today = datetime.now(timezone.utc).date()
    monday = today - timedelta(days=today.weekday())   # weekday(): Mon=0, Sun=6
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _week_bounds_for(dt: datetime) -> tuple[date, date]:
    d = dt.date()
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


# ─── Groq narrative generator ─────────────────────────────────────────────────

async def _generate_ai_narrative(
    week_start: date,
    week_end: date,
    career_goal: Optional[str],
    lessons_completed: int,
    avg_quiz_score: float,
    highest_quiz_score: float,
    streak_days: int,
    topics_completed: List[str],
    weak_concepts: List[str],
    most_improved: List[str],
    recommended: List[str],
) -> str:
    """Call Groq to produce a short, warm weekly summary. Returns fallback on failure."""
    week_label = f"{week_start.strftime('%b %d')} – {week_end.strftime('%b %d, %Y')}"

    fallback_parts = [
        f"Great work this week ({week_label})!",
        f" You completed {lessons_completed} lesson{'s' if lessons_completed != 1 else ''}",
        f" with an average quiz score of {avg_quiz_score:.0f}%." if avg_quiz_score > 0 else ".",
    ]
    if most_improved:
        fallback_parts.append(f" Your strongest areas were {', '.join(most_improved[:2])}.")
    if weak_concepts:
        fallback_parts.append(f" Focus on {', '.join(weak_concepts[:2])} next week.")
    if recommended:
        fallback_parts.append(f" Recommended next: {recommended[0]}.")
    fallback = "".join(fallback_parts)

    if not settings.groq_api_key or lessons_completed == 0:
        return fallback

    system_prompt = (
        "You are Reva, a warm and motivating AI mentor for college students. "
        "Write a 3-5 sentence weekly learning summary that celebrates progress, "
        "acknowledges weak areas constructively, and sets a positive tone for the coming week. "
        "Be specific using the data provided. No generic filler. Return only the summary text."
    )
    user_context = (
        f"Week: {week_label}\n"
        f"Career Goal: {career_goal or 'General Learning'}\n"
        f"Lessons Completed: {lessons_completed}\n"
        f"Average Quiz Score: {avg_quiz_score:.0f}%\n"
        f"Highest Quiz Score: {highest_quiz_score:.0f}%\n"
        f"Learning Streak: {streak_days} day{'s' if streak_days != 1 else ''}\n"
        f"Topics Completed: {', '.join(topics_completed) if topics_completed else 'None'}\n"
        f"Most Improved: {', '.join(most_improved) if most_improved else 'None'}\n"
        f"Weak Concepts: {', '.join(weak_concepts) if weak_concepts else 'None'}\n"
        f"Recommended Next: {', '.join(recommended[:2]) if recommended else 'General review'}\n"
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_context},
        ],
        "temperature": 0.65,
        "max_tokens": 300,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                text = res.json()["choices"][0]["message"]["content"].strip()
                if text:
                    return text
    except Exception:
        pass

    return fallback


# ─── Main service functions ───────────────────────────────────────────────────

async def get_or_generate_current_week_report(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> WeeklyLearningReport:
    """
    Return the existing report for the current week if it exists,
    otherwise generate it, persist it, and return it.
    """
    week_start, week_end = _current_week_bounds()

    # 1. Check if report already exists for this week
    existing = await db.execute(
        select(WeeklyLearningReport).where(
            and_(
                WeeklyLearningReport.user_id == user_id,
                WeeklyLearningReport.week_start == week_start,
            )
        )
    )
    report = existing.scalar_one_or_none()
    if report is not None:
        return report

    # 2. Generate a new one
    return await _generate_and_store_report(db, user_id, week_start, week_end)


async def list_reports_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 12,
) -> List[WeeklyLearningReport]:
    """Return all stored reports for a student, newest first."""
    result = await db.execute(
        select(WeeklyLearningReport)
        .where(WeeklyLearningReport.user_id == user_id)
        .order_by(WeeklyLearningReport.week_start.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_report_by_id(
    db: AsyncSession,
    user_id: uuid.UUID,
    report_id: uuid.UUID,
) -> Optional[WeeklyLearningReport]:
    result = await db.execute(
        select(WeeklyLearningReport).where(
            and_(
                WeeklyLearningReport.id == report_id,
                WeeklyLearningReport.user_id == user_id,
            )
        )
    )
    return result.scalar_one_or_none()


# ─── Internal generation ──────────────────────────────────────────────────────

async def _generate_and_store_report(
    db: AsyncSession,
    user_id: uuid.UUID,
    week_start: date,
    week_end: date,
) -> WeeklyLearningReport:
    """Aggregate this week's data from DB and persist a new report."""

    profile = await get_or_create_learning_profile(db, user_id)

    # Convert week boundaries to datetime for comparison
    week_start_dt = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
    week_end_dt = datetime(week_end.year, week_end.month, week_end.day, 23, 59, 59, tzinfo=timezone.utc)

    # Fetch UserLearningMemory entries created this week
    mem_stmt = (
        select(UserLearningMemory)
        .where(
            and_(
                UserLearningMemory.user_id == user_id,
                UserLearningMemory.completed_at >= week_start_dt,
                UserLearningMemory.completed_at <= week_end_dt,
            )
        )
        .order_by(UserLearningMemory.quiz_score.desc())
    )
    mem_res = await db.execute(mem_stmt)
    memories: List[UserLearningMemory] = list(mem_res.scalars().all())

    # Aggregate stats
    lessons_completed = len(memories)
    quizzes_with_scores = [m.quiz_score for m in memories if m.quiz_score and m.quiz_score > 0]
    avg_quiz_score = round(sum(quizzes_with_scores) / len(quizzes_with_scores), 1) if quizzes_with_scores else 0.0
    highest_quiz_score = round(max(quizzes_with_scores), 1) if quizzes_with_scores else 0.0
    quizzes_completed = len(quizzes_with_scores)

    # Topics completed (high score = mastered; low = needs revision)
    topics_completed = [m.topic_title for m in memories if m.quiz_score >= 70]
    topics_needing_revision = [m.topic_title for m in memories if m.quiz_score < 70 and m.quiz_score > 0]

    # Most improved = topics with highest quiz score this week (top 3)
    most_improved = [m.topic_title for m in sorted(memories, key=lambda x: x.quiz_score, reverse=True)[:3]
                     if m.quiz_score >= 70]

    # Weak concepts from concept gaps (top 5)
    gaps_stmt = (
        select(UserConceptGap.concept_category)
        .where(UserConceptGap.user_id == user_id)
        .order_by(UserConceptGap.miss_count.desc())
        .limit(5)
    )
    gaps_res = await db.execute(gaps_stmt)
    weak_concepts = list(gaps_res.scalars().all())

    # Also collect from memory weak concepts
    mem_weak = []
    for m in memories:
        if m.weak_concepts:
            mem_weak.extend(m.weak_concepts)
    # Deduplicate and merge
    all_weak = list(dict.fromkeys(weak_concepts + mem_weak))[:5]

    # Recommended next = related_topics from recent memories
    recommended: List[str] = []
    for m in memories[:3]:
        if m.related_topics:
            recommended.extend(m.related_topics)
    recommended = list(dict.fromkeys(recommended))[:4]
    if not recommended and profile.career_goal:
        recommended = [f"Advanced {profile.career_goal} topics"]

    # Study time: use profile's current total minus what was there before this week
    # Since we don't track per-session delta, use a rough estimate: avg 30 min per lesson
    total_study_time_seconds = lessons_completed * 1800

    # Generate AI narrative
    ai_summary = await _generate_ai_narrative(
        week_start=week_start,
        week_end=week_end,
        career_goal=profile.career_goal,
        lessons_completed=lessons_completed,
        avg_quiz_score=avg_quiz_score,
        highest_quiz_score=highest_quiz_score,
        streak_days=profile.current_streak_days,
        topics_completed=topics_completed,
        weak_concepts=all_weak,
        most_improved=most_improved,
        recommended=recommended,
    )

    report = WeeklyLearningReport(
        user_id=user_id,
        week_start=week_start,
        week_end=week_end,
        total_study_time_seconds=total_study_time_seconds,
        lessons_completed=lessons_completed,
        quizzes_completed=quizzes_completed,
        avg_quiz_score=avg_quiz_score,
        highest_quiz_score=highest_quiz_score,
        streak_days=profile.current_streak_days,
        topics_completed=topics_completed,
        topics_needing_revision=topics_needing_revision,
        most_improved_concepts=most_improved,
        weak_concepts=all_weak,
        recommended_next_topics=recommended,
        ai_summary=ai_summary,
        career_goal=profile.career_goal,
        is_ai_generated=bool(settings.groq_api_key) and lessons_completed > 0,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report
