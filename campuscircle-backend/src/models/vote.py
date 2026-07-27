import uuid
from datetime import datetime

from sqlalchemy import String, SmallInteger, DateTime, ForeignKey, UniqueConstraint, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class Vote(Base):
    __tablename__ = "votes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # target_id + target_type together point at EITHER a post OR a comment.
    # This is called a "polymorphic association" — it's a deliberate
    # trade-off: one votes table instead of two (post_votes, comment_votes),
    # simpler application code, at the cost of not having a real foreign
    # key constraint on target_id (Postgres can't FK to "one of two tables").
    target_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(10), nullable=False)  # "post" | "comment"

    value: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1 or -1

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # THIS is the line that makes voting "idempotent" the way we
        # described in the API design — Postgres physically will not
        # allow the same user to have two votes on the same item.
        UniqueConstraint("user_id", "target_id", "target_type", name="uq_one_vote_per_user_per_item"),
        CheckConstraint("value IN (-1, 1)", name="ck_vote_value"),
        CheckConstraint("target_type IN ('post', 'comment')", name="ck_vote_target_type"),
    )
