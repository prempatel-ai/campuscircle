"""create tags and post_tags tables

Revision ID: f98765432101
Revises: e89123456789
Create Date: 2026-07-29 19:25:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f98765432101'
down_revision: Union[str, None] = 'e89123456789'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create tags table
    op.create_table(
        'tags',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('university_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('universities.id'), nullable=False),
        sa.Column('name', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('university_id', 'name', name='uq_tags_university_name')
    )
    op.create_index(op.f('ix_tags_university_id'), 'tags', ['university_id'], unique=False)

    # 2. Create post_tags junction table
    op.create_table(
        'post_tags',
        sa.Column('post_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('posts.id', ondelete='CASCADE'), primary_key=True, nullable=False),
        sa.Column('tag_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True, nullable=False)
    )


def downgrade() -> None:
    op.drop_table('post_tags')
    op.drop_index(op.f('ix_tags_university_id'), table_name='tags')
    op.drop_table('tags')
