import uuid
from datetime import datetime

from sqlalchemy import String, Text, Integer, SmallInteger, Boolean, DateTime, ForeignKey, Computed, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    community_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("communities.id"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR().with_variant(Text, "sqlite"),
        nullable=True
    )

    # Threading support for multi-part linked posts
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True, index=True
    )
    thread_position: Mapped[int | None] = mapped_column(
        SmallInteger, nullable=True
    )

    # Denormalized vote count — updated whenever a vote is cast, so reads
    # never have to COUNT(*) over the votes table. This is the exact
    # optimization we flagged in the design doc §5.
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Soft delete — we never actually remove a row, just hide it. This
    # keeps comment threads intact even if their parent post is "deleted."
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
