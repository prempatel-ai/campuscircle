"""add career_goal to student_learning_profiles

Revision ID: k98765432111
Revises: j98765432110
Create Date: 2026-08-04 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'k98765432111'
down_revision: Union[str, None] = 'j98765432110'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('student_learning_profiles', sa.Column('career_goal', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('student_learning_profiles', 'career_goal')
