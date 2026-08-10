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

from src.models.learning_session import LearningSession
from src.models.student_learning_profile import StudentLearningProfile
from src.models.user_learning_memory import UserLearningMemory
from src.models.user_concept_gap import UserConceptGap
from src.schemas.learn import LearningDashboardOut, SubjectMasteryItem, RecentActivityItem
from src.services.learning_profile_service import get_or_create_learning_profile


def infer_subject_category(topic_title: str) -> str:
    """Dynamically infer subject category from topic title keywords."""
    if not topic_title:
        return "Computer Science"
    t = topic_title.lower()
    if any(k in t for k in ["python", "django", "flask", "numpy", "pandas", "pytorch", "script"]):
        return "Python"
    if any(k in t for k in ["dbms", "sql", "database", "postgres", "query", "normalization", "relational", "nosql"]):
        return "DBMS"
    if any(k in t for k in ["os", "operating system", "process", "thread", "kernel", "deadlock", "memory management"]):
        return "Operating System"
    if any(k in t for k in ["network", "tcp", "udp", "ip", "http", "socket", "dns", "router"]):
        return "Computer Networks"
    if any(k in t for k in ["algorithm", "data structure", "tree", "graph", "sorting", "binary search", "recursion", "dynamic programming"]):
        return "Data Structures & Algorithms"
    if any(k in t for k in ["ai", "ml", "machine learning", "deep learning", "neural", "llm", "rag", "transformer"]):
        return "Artificial Intelligence"
    if any(k in t for k in ["java", "c++", "c#", "rust", "go", "javascript", "typescript", "html", "css"]):
        return "Programming & Development"
    if any(k in t for k in ["system design", "distributed", "scalability", "load balancing", "microservices"]):
        return "System Design"
    return "Computer Science"


async def get_learning_dashboard(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> LearningDashboardOut:
    """
    Build a complete LearningDashboardOut for the given user.
    All data is read dynamically from stored DB records in real time.
    """
    # 1. Student Learning Profile (create if missing for brand-new users)
    profile: StudentLearningProfile = await get_or_create_learning_profile(db, user_id)

    # 2. Query all user memories ordered newest first
    memories_stmt = (
        select(UserLearningMemory)
        .where(UserLearningMemory.user_id == user_id)
        .order_by(UserLearningMemory.completed_at.desc())
    )
    memories_res = await db.execute(memories_stmt)
    memories: List[UserLearningMemory] = list(memories_res.scalars().all())

    # 3. Query all user learning sessions ordered newest first
    sessions_stmt = (
        select(LearningSession)
        .where(LearningSession.user_id == user_id)
        .order_by(LearningSession.created_at.desc())
    )
    sessions_res = await db.execute(sessions_stmt)
    sessions: List[LearningSession] = list(sessions_res.scalars().all())

    # 4. Real-time Subject Mastery aggregation
    subject_buckets: dict[str, list[float]] = defaultdict(list)
    all_scores: list[float] = []

    # Process memories
    for mem in memories:
        subject = mem.subject_category or infer_subject_category(mem.topic_title)
        if mem.quiz_score is not None and mem.quiz_score > 0:
            subject_buckets[subject].append(mem.quiz_score)
            all_scores.append(mem.quiz_score)

    # Process learning sessions for any completed quiz scores
    for sess in sessions:
        subject = infer_subject_category(sess.video_title)
        progress = sess.user_progress or {}
        scores_found = []
        if isinstance(progress, dict):
            for p_key in ["phase1_score", "phase2_score", "phase3_score"]:
                if p_key in progress:
                    try:
                        val = float(progress[p_key])
                        if val > 0:
                            scores_found.append(val)
                    except (ValueError, TypeError):
                        pass
        if scores_found:
            sess_avg = sum(scores_found) / len(scores_found)
            subject_buckets[subject].append(sess_avg)
            all_scores.append(sess_avg)

    # Calculate real-time subject mastery per subject
    subject_mastery: List[SubjectMasteryItem] = []
    for subject, scores in sorted(subject_buckets.items(), key=lambda x: -sum(x[1]) / len(x[1])):
        avg = round(sum(scores) / len(scores), 1)
        subject_mastery.append(SubjectMasteryItem(
            subject=subject,
            mastery_percent=avg,
            sessions_count=len(scores),
        ))

    # Real-time Overall Mastery calculation across all real session & memory quiz scores
    if all_scores:
        overall_mastery = round(sum(all_scores) / len(all_scores), 1)
    elif profile.avg_quiz_score > 0:
        overall_mastery = round(profile.avg_quiz_score, 1)
    else:
        overall_mastery = 0.0

    # 4. Recent activity — last 7 memories or sessions
    session_map_by_title = {s.video_title.strip().lower(): str(s.id) for s in sessions}
    recent_raw = memories[:7]
    recent_activity: List[RecentActivityItem] = []

    for m in recent_raw:
        s_id = str(m.session_id) if m.session_id else session_map_by_title.get(m.topic_title.strip().lower())
        recent_activity.append(
            RecentActivityItem(
                session_id=s_id,
                topic_title=m.topic_title,
                subject_category=m.subject_category or "General",
                quiz_score=m.quiz_score,
                mastery_level=m.mastery_level or "Novice",
                completed_at=m.completed_at,
            )
        )

    if not recent_activity and sessions:
        for s in sessions[:7]:
            recent_activity.append(
                RecentActivityItem(
                    session_id=str(s.id),
                    topic_title=s.video_title,
                    subject_category=infer_subject_category(s.video_title),
                    quiz_score=0.0,
                    mastery_level="In Progress",
                    completed_at=s.created_at,
                )
            )

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
