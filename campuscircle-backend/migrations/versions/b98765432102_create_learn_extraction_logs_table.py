"""create learn_extraction_logs table

Revision ID: b98765432102
Revises: a1234567890b
Create Date: 2026-07-30 05:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b98765432102'
down_revision: Union[str, None] = 'a1234567890b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'learn_extraction_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('video_id', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index(op.f('ix_learn_extraction_logs_user_id'), 'learn_extraction_logs', ['user_id'], unique=False)
    op.create_index(op.f('ix_learn_extraction_logs_created_at'), 'learn_extraction_logs', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_learn_extraction_logs_created_at'), table_name='learn_extraction_logs')
    op.drop_index(op.f('ix_learn_extraction_logs_user_id'), table_name='learn_extraction_logs')
    op.drop_table('learn_extraction_logs')
