"""create user_learning_memories table

Revision ID: l98765432112
Revises: k98765432111
Create Date: 2026-08-04 21:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'l98765432112'
down_revision: Union[str, None] = 'k98765432111'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_learning_memories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('learning_sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('topic_title', sa.String(length=255), nullable=False),
        sa.Column('subject_category', sa.String(length=100), server_default='General', nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('quiz_score', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('mastery_level', sa.String(length=50), server_default='Novice', nullable=False),
        sa.Column('key_concepts', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('weak_concepts', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('related_topics', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('ix_user_learning_memories_user_id', 'user_learning_memories', ['user_id'])
    op.create_index('ix_user_learning_memories_topic_title', 'user_learning_memories', ['topic_title'])
    op.create_index('ix_user_learning_memories_subject_category', 'user_learning_memories', ['subject_category'])


def downgrade() -> None:
    op.drop_index('ix_user_learning_memories_subject_category', table_name='user_learning_memories')
    op.drop_index('ix_user_learning_memories_topic_title', table_name='user_learning_memories')
    op.drop_index('ix_user_learning_memories_user_id', table_name='user_learning_memories')
    op.drop_table('user_learning_memories')
