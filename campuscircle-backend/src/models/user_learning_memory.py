import uuid
from datetime import datetime

from sqlalchemy import String, Float, DateTime, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class UserLearningMemory(Base):
    __tablename__ = "user_learning_memories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("learning_sessions.id", ondelete="SET NULL"), nullable=True
    )

    topic_title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subject_category: Mapped[str] = mapped_column(String(100), default="General", server_default="General", nullable=False, index=True)

    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    quiz_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0", nullable=False)
    mastery_level: Mapped[str] = mapped_column(String(50), default="Novice", server_default="Novice", nullable=False)

    key_concepts: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )
    weak_concepts: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )
    related_topics: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, server_default="[]", nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
