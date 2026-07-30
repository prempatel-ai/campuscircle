"""create user_concept_gaps table

Revision ID: f98765432106
Revises: e98765432105
Create Date: 2026-07-30 12:23:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f98765432106'
down_revision: Union[str, None] = 'e98765432105'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_concept_gaps',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('concept_category', sa.String(length=100), nullable=False),
        sa.Column('miss_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('user_id', 'concept_category', name='uq_user_concept_category')
    )
    op.create_index('ix_user_concept_gaps_user_id', 'user_concept_gaps', ['user_id'])
    op.create_index('ix_user_concept_gaps_concept_category', 'user_concept_gaps', ['concept_category'])


def downgrade() -> None:
    op.drop_index('ix_user_concept_gaps_concept_category', table_name='user_concept_gaps')
    op.drop_index('ix_user_concept_gaps_user_id', table_name='user_concept_gaps')
    op.drop_table('user_concept_gaps')
