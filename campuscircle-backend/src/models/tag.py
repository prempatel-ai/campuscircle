import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Table, Column, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base

# Junction table between posts and tags
post_tags = Table(
    "post_tags",
    Base.metadata,
    Column("post_id", PG_UUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", PG_UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    """
    Tags are scoped strictly per university to prevent cross-university data/tag leaks.
    """
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("university_id", "name", name="uq_tags_university_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    university_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("universities.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
