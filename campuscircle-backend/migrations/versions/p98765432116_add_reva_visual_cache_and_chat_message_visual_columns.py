"""add reva visual cache tables and visual columns to chat_messages

Revision ID: p98765432116
Revises: o98765432115
Create Date: 2026-08-11 14:35:00.000000

Adds reva_visual_caches and reva_visual_rate_limits tables,
and adds visual_html and visual_title columns to chat_messages.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'p98765432116'
down_revision: Union[str, None] = 'o98765432115'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add visual_html and visual_title to chat_messages
    op.add_column('chat_messages', sa.Column('visual_html', sa.Text(), nullable=True))
    op.add_column('chat_messages', sa.Column('visual_title', sa.String(length=255), nullable=True))

    # 2. Create reva_visual_caches table
    op.create_table(
        'reva_visual_caches',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('normalized_query', sa.String(length=512), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('visual_html', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_reva_visual_caches_normalized_query', 'reva_visual_caches', ['normalized_query'])

    # 3. Create reva_visual_rate_limits table
    op.create_table(
        'reva_visual_rate_limits',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date_stamp', sa.String(length=10), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_reva_visual_rate_limits_user_id', 'reva_visual_rate_limits', ['user_id'])
    op.create_index('ix_reva_visual_rate_limits_date_stamp', 'reva_visual_rate_limits', ['date_stamp'])


def downgrade() -> None:
    op.drop_index('ix_reva_visual_rate_limits_date_stamp', table_name='reva_visual_rate_limits')
    op.drop_index('ix_reva_visual_rate_limits_user_id', table_name='reva_visual_rate_limits')
    op.drop_table('reva_visual_rate_limits')

    op.drop_index('ix_reva_visual_caches_normalized_query', table_name='reva_visual_caches')
    op.drop_table('reva_visual_caches')

    op.drop_column('chat_messages', 'visual_title')
    op.drop_column('chat_messages', 'visual_html')
