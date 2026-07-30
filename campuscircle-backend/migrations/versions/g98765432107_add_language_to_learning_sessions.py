"""add language column to learning_sessions table

Revision ID: g98765432107
Revises: f98765432106
Create Date: 2026-07-30 12:24:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g98765432107'
down_revision: Union[str, None] = 'f98765432106'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'learning_sessions',
        sa.Column('language', sa.String(length=10), server_default='en', nullable=False)
    )
    op.create_index('ix_learning_sessions_language', 'learning_sessions', ['language'])


def downgrade() -> None:
    op.drop_index('ix_learning_sessions_language', table_name='learning_sessions')
    op.drop_column('learning_sessions', 'language')
