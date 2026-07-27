import uuid
from datetime import datetime

from sqlalchemy import Text, Integer, SmallInteger, Boolean, DateTime, ForeignKey, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False, index=True)

    # This is what makes threading work: a comment's parent_id points to
    # ANOTHER ROW IN THIS SAME TABLE. Top-level comments have parent_id = NULL.
    # This self-reference is the whole trick behind nested replies.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("comments.id"), nullable=True, index=True
    )

    author_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    content: Mapped[str] = mapped_column(Text, nullable=False)
    depth: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Hard cap on nesting depth, matches the design doc decision (max 8).
    __table_args__ = (CheckConstraint("depth <= 8", name="ck_comment_max_depth"),)
