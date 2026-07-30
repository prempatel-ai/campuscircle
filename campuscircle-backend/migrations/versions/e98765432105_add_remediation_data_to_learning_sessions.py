"""add remediation_data to learning_sessions table

Revision ID: e98765432105
Revises: d98765432104
Create Date: 2026-07-30 12:22:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e98765432105'
down_revision: Union[str, None] = 'd98765432104'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'learning_sessions',
        sa.Column('remediation_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('learning_sessions', 'remediation_data')
