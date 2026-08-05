import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.models.user_learning_memory import UserLearningMemory
from src.models.learning_session import LearningSession


def _tokenize(text: str) -> set:
    """Extract lowercase words with length > 2 for keyword matching."""
    if not text:
        return set()
    words = re.findall(r'\b[a-zA-Z0-9]{3,}\b', text.lower())
    # Exclude common stop words
    stop_words = {"the", "and", "for", "with", "how", "what", "intro", "introduction", "basics", "overview", "crash", "course"}
    return {w for w in words if w not in stop_words}


async def create_or_update_memory_from_session(
    db: AsyncSession,
    session: LearningSession
) -> Optional[UserLearningMemory]:
    """
    Extracts lightweight memory snapshot from a LearningSession and persists it in user_learning_memories.
    """
    if not session or not session.user_id:
        return None

    # 1. Check if memory already exists for this session
    stmt = select(UserLearningMemory).where(
        UserLearningMemory.user_id == session.user_id,
        UserLearningMemory.session_id == session.id
    )
    res = await db.execute(stmt)
    memory = res.scalar_one_or_none()

    if not memory:
        # Fallback check by topic title for this user
        stmt_title = select(UserLearningMemory).where(
            UserLearningMemory.user_id == session.user_id,
            UserLearningMemory.topic_title == session.video_title
        )
        res_title = await db.execute(stmt_title)
        memory = res_title.scalar_one_or_none()

    # Extract key concepts from explanation chunks
    key_concepts = []
    if session.explanation_chunks and isinstance(session.explanation_chunks, dict):
        chunks = session.explanation_chunks.get("chunks", [])
        for c in chunks:
            if isinstance(c, dict) and "title" in c:
                clean_title = re.sub(r'^\d+[\.\)]\s*', '', c["title"]).strip()
                if clean_title:
                    key_concepts.append(clean_title)

    # Compute mastery level and score from progress
    progress = session.user_progress or {}
    score = 0.0
    scores_found = []
    if isinstance(progress, dict):
        for p_key in ["phase1_score", "phase2_score", "phase3_score"]:
            if p_key in progress:
                try:
                    scores_found.append(float(progress[p_key]))
                except (ValueError, TypeError):
                    pass

    if scores_found:
        score = sum(scores_found) / len(scores_found)

    if score >= 90.0:
        mastery = "Mastered"
    elif score >= 70.0:
        mastery = "Intermediate"
    else:
        mastery = "Novice"

    now = datetime.now(timezone.utc)

    if not memory:
        memory = UserLearningMemory(
            user_id=session.user_id,
            session_id=session.id,
            topic_title=session.video_title,
            subject_category="Computer Science",
            completed_at=now,
            quiz_score=score,
            mastery_level=mastery,
            key_concepts=key_concepts[:5],
            weak_concepts=[],
            related_topics=[]
        )
        db.add(memory)
    else:
        memory.completed_at = now
        if score > 0:
            memory.quiz_score = max(memory.quiz_score or 0.0, score)
            memory.mastery_level = mastery
        if key_concepts:
            memory.key_concepts = key_concepts[:5]
            flag_modified(memory, "key_concepts")

    await db.commit()
    await db.refresh(memory)
    return memory


async def get_relevant_memories_for_topic(
    db: AsyncSession,
    user_id: uuid.UUID,
    current_topic_title: str,
    limit: int = 3
) -> List[str]:
    """
    Retrieves top `limit` relevant previous learning memory summaries for prompt injection.
    Scores memories by keyword overlap with current_topic_title, recency, and mastery level.
    """
    stmt = (
        select(UserLearningMemory)
        .where(UserLearningMemory.user_id == user_id)
        .order_by(desc(UserLearningMemory.completed_at))
        .limit(20)
    )
    res = await db.execute(stmt)
    memories = list(res.scalars().all())

    if not memories:
        return []

    target_tokens = _tokenize(current_topic_title)

    scored_memories = []
    for m in memories:
        # Don't match exact same topic if user is re-explaining identical topic
        if m.topic_title.strip().lower() == current_topic_title.strip().lower():
            continue

        mem_tokens = _tokenize(m.topic_title)
        for concept in (m.key_concepts or []):
            mem_tokens.update(_tokenize(str(concept)))

        overlap = len(target_tokens.intersection(mem_tokens))

        # Recency boost (within 7 days = +1.0)
        days_old = (datetime.now(timezone.utc) - m.completed_at.replace(tzinfo=timezone.utc)).days if m.completed_at.tzinfo is None else (datetime.now(timezone.utc) - m.completed_at).days
        recency_score = 1.0 if days_old <= 7 else 0.3

        # Base score
        total_score = (overlap * 3.0) + recency_score

        if total_score > 0:
            scored_memories.append((total_score, m))

    # Sort by relevance score descending
    scored_memories.sort(key=lambda x: x[0], reverse=True)

    top_memories = [m for _, m in scored_memories[:limit]]

    # Format into concise prompt summaries
    formatted_summaries = []
    for m in top_memories:
        concepts_str = ", ".join(m.key_concepts[:3]) if m.key_concepts else "Core concepts"
        summary_str = f"Topic: '{m.topic_title}' (Mastery: {m.mastery_level}, Key Concepts: {concepts_str})"
        formatted_summaries.append(summary_str)

    return formatted_summaries
