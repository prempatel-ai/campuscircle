"""
University is the root of our data isolation model. Every piece of
content in the whole system traces back to a university_id, directly
or through a chain of foreign keys. This is the table that makes the
"cross-university isolation" promise enforceable.
"""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class University(Base):
    __tablename__ = "universities"

    # uuid.uuid4 generates the ID in Python before insert; server_default
    # would generate it in Postgres instead — either works, we do it in
    # Python here for simplicity.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # unique=True is what stops two universities from claiming the same
    # email domain — this is a database-level guarantee, not just an
    # application-level check, so it can never be bypassed by a bug.
    email_domain: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
