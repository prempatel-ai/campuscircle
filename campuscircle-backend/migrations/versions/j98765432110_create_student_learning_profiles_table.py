"""create student_learning_profiles table

Revision ID: j98765432110
Revises: i98765432109
Create Date: 2026-08-04 18:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'j98765432110'
down_revision: Union[str, None] = 'i98765432109'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'student_learning_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('total_sessions', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_study_time_seconds', sa.Integer(), server_default='0', nullable=False),
        sa.Column('topics_completed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('topics_learning', sa.Integer(), server_default='0', nullable=False),
        sa.Column('avg_quiz_score', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('highest_quiz_score', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('total_quizzes_completed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('strong_concepts', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('weak_concepts', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('preferred_language', sa.String(length=10), server_default='en', nullable=False),
        sa.Column('current_streak_days', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_learning_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('extra_data', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('ix_student_learning_profiles_user_id', 'student_learning_profiles', ['user_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_student_learning_profiles_user_id', table_name='student_learning_profiles')
    op.drop_table('student_learning_profiles')
