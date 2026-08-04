"""create lesson_chat_messages table

Revision ID: m98765432113
Revises: l98765432112
Create Date: 2026-08-04 21:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'm98765432113'
down_revision: Union[str, None] = 'l98765432112'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'lesson_chat_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('learning_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sender', sa.String(length=16), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('ix_lesson_chat_messages_session_id', 'lesson_chat_messages', ['session_id'])
    op.create_index('ix_lesson_chat_messages_user_id', 'lesson_chat_messages', ['user_id'])
    op.create_index('ix_lesson_chat_messages_created_at', 'lesson_chat_messages', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_lesson_chat_messages_created_at', table_name='lesson_chat_messages')
    op.drop_index('ix_lesson_chat_messages_user_id', table_name='lesson_chat_messages')
    op.drop_index('ix_lesson_chat_messages_session_id', table_name='lesson_chat_messages')
    op.drop_table('lesson_chat_messages')
