"""add_posts_search_vector

Revision ID: f0c6426d4fad
Revises: de611dd6255a
Create Date: 2026-07-27 21:49:15.502460

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f0c6426d4fad'
down_revision: Union[str, None] = 'de611dd6255a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE posts ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(content, '')), 'B')
        ) STORED;
    """)
    op.execute("""
        CREATE INDEX ix_posts_search_vector ON posts USING GIN (search_vector);
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_posts_search_vector;")
    op.execute("ALTER TABLE posts DROP COLUMN IF EXISTS search_vector;")
