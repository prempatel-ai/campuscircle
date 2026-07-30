"""create learning_sessions table

Revision ID: c98765432103
Revises: b98765432102
Create Date: 2026-07-30 05:52:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c98765432103'
down_revision: Union[str, None] = 'b98765432102'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'learning_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('video_id', sa.String(length=32), nullable=False),
        sa.Column('youtube_url', sa.String(length=512), nullable=False),
        sa.Column('video_title', sa.String(length=255), nullable=False),
        sa.Column('transcript', sa.Text(), nullable=False),
        sa.Column('explanation_chunks', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index(op.f('ix_learning_sessions_user_id'), 'learning_sessions', ['user_id'], unique=False)
    op.create_index(op.f('ix_learning_sessions_video_id'), 'learning_sessions', ['video_id'], unique=False)
    op.create_index(op.f('ix_learning_sessions_created_at'), 'learning_sessions', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_learning_sessions_created_at'), table_name='learning_sessions')
    op.drop_index(op.f('ix_learning_sessions_video_id'), table_name='learning_sessions')
    op.drop_index(op.f('ix_learning_sessions_user_id'), table_name='learning_sessions')
    op.drop_table('learning_sessions')
