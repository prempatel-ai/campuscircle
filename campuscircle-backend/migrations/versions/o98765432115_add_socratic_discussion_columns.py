"""create socratic discussion via discussion_type column on lesson_chat_messages

Revision ID: o98765432115
Revises: n98765432114
Create Date: 2026-08-05 22:15:00.000000

Adds a discussion_type column to lesson_chat_messages so we can
distinguish regular lesson chat from Socratic discussion messages,
and an is_concluded flag on learning_sessions for discussion state.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'o98765432115'
down_revision: Union[str, None] = 'n98765432114'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add discussion_type to lesson_chat_messages
    # 'lesson_chat' = regular follow-up chat
    # 'socratic'    = Socratic discussion after quiz completion
    op.add_column(
        'lesson_chat_messages',
        sa.Column(
            'discussion_type',
            sa.String(length=20),
            nullable=False,
            server_default='lesson_chat'
        )
    )
    op.create_index(
        'ix_lesson_chat_messages_discussion_type',
        'lesson_chat_messages',
        ['discussion_type']
    )

    # Track whether a Socratic discussion was concluded for a session
    op.add_column(
        'learning_sessions',
        sa.Column('socratic_concluded', sa.Boolean(), nullable=False, server_default='false')
    )
    # Store the understanding level determined at end of discussion
    op.add_column(
        'learning_sessions',
        sa.Column('socratic_understanding_level', sa.String(length=30), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('learning_sessions', 'socratic_understanding_level')
    op.drop_column('learning_sessions', 'socratic_concluded')
    op.drop_index('ix_lesson_chat_messages_discussion_type', table_name='lesson_chat_messages')
    op.drop_column('lesson_chat_messages', 'discussion_type')
