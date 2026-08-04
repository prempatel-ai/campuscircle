import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class StudentLearningProfile(Base):
    __tablename__ = "student_learning_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )

    total_sessions: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    total_study_time_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    topics_completed: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    topics_learning: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    avg_quiz_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0", nullable=False)
    highest_quiz_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0", nullable=False)
    total_quizzes_completed: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    strong_concepts: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )
    weak_concepts: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )

    preferred_language: Mapped[str] = mapped_column(String(10), default="en", server_default="en", nullable=False)
    current_streak_days: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    last_learning_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    career_goal: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Extensible JSON store for future features (AI Mentor, career goals, etc.)
    extra_data: Mapped[dict] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=dict, server_default="{}", nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
