"""create weekly_learning_reports table

Revision ID: n98765432114
Revises: m98765432113
Create Date: 2026-08-04 22:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'n98765432114'
down_revision: Union[str, None] = 'm98765432113'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'weekly_learning_reports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),

        # Week identification
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('week_end', sa.Date(), nullable=False),

        # Quantitative stats
        sa.Column('total_study_time_seconds', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('lessons_completed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('quizzes_completed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_quiz_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('highest_quiz_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('streak_days', sa.Integer(), nullable=False, server_default='0'),

        # JSON lists
        sa.Column('topics_completed', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('topics_needing_revision', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('most_improved_concepts', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('weak_concepts', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('recommended_next_topics', postgresql.JSONB(), nullable=False, server_default='[]'),

        # AI narrative
        sa.Column('ai_summary', sa.Text(), nullable=False, server_default=''),
        sa.Column('career_goal', sa.String(100), nullable=True),
        sa.Column('is_ai_generated', sa.Boolean(), nullable=False, server_default='false'),

        # Timestamps
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_weekly_learning_reports_user_id', 'weekly_learning_reports', ['user_id'])
    op.create_index('ix_weekly_learning_reports_week_start', 'weekly_learning_reports', ['week_start'])
    # Unique per user per week
    op.create_unique_constraint(
        'uq_weekly_report_user_week',
        'weekly_learning_reports',
        ['user_id', 'week_start']
    )


def downgrade() -> None:
    op.drop_constraint('uq_weekly_report_user_week', 'weekly_learning_reports', type_='unique')
    op.drop_index('ix_weekly_learning_reports_week_start', table_name='weekly_learning_reports')
    op.drop_index('ix_weekly_learning_reports_user_id', table_name='weekly_learning_reports')
    op.drop_table('weekly_learning_reports')
