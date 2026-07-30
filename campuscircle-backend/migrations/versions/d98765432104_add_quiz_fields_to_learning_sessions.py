"""add quiz_data and user_progress to learning_sessions table

Revision ID: d98765432104
Revises: c98765432103
Create Date: 2026-07-30 05:54:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd98765432104'
down_revision: Union[str, None] = 'c98765432103'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'learning_sessions',
        sa.Column('quiz_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True)
    )
    op.add_column(
        'learning_sessions',
        sa.Column('user_progress', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('learning_sessions', 'user_progress')
    op.drop_column('learning_sessions', 'quiz_data')
