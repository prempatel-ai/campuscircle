"""add user settings and soft delete fields

Revision ID: i98765432109
Revises: h98765432108
Create Date: 2026-08-04 01:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i98765432109'
down_revision: Union[str, None] = 'h98765432108'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('notifications_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False))
    op.add_column('users', sa.Column('is_deleted', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('users', sa.Column('last_username_change_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'last_username_change_at')
    op.drop_column('users', 'is_deleted')
    op.drop_column('users', 'notifications_enabled')
