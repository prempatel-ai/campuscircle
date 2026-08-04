import uuid
from datetime import datetime, date

from sqlalchemy import String, Text, Integer, Float, Date, DateTime, ForeignKey, func, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class WeeklyLearningReport(Base):
    """
    Stores one AI-generated weekly summary per student per calendar week.
    Reports are generated lazily on first access of a new week and reused thereafter.
    """
    __tablename__ = "weekly_learning_reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )

    # ISO calendar week identification
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)  # Monday
    week_end: Mapped[date] = mapped_column(Date, nullable=False)                # Sunday

    # ── Quantitative stats for this week ─────────────────────────────────────
    total_study_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lessons_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quizzes_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_quiz_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    highest_quiz_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    streak_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── JSON lists ────────────────────────────────────────────────────────────
    topics_completed: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )
    topics_needing_revision: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )
    most_improved_concepts: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )
    weak_concepts: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )
    recommended_next_topics: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )

    # ── AI narrative ──────────────────────────────────────────────────────────
    ai_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    career_goal: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── Metadata ──────────────────────────────────────────────────────────────
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
