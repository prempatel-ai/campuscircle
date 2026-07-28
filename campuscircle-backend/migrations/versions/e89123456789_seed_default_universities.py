"""seed default universities

Revision ID: e89123456789
Revises: de611dd6255a
Create Date: 2026-07-28 17:25:00.000000

"""
import uuid
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e89123456789'
down_revision: Union[str, None] = '6e04f6d6392d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SEED_UNIVERSITIES = [
    {"name": "Sardar Patel College of Engineering (SPU)", "email_domain": "spcevng.ac.in"},
    {"name": "Stanford University", "email_domain": "stanford.edu"},
    {"name": "Massachusetts Institute of Technology", "email_domain": "mit.edu"},
    {"name": "Harvard University", "email_domain": "harvard.edu"},
    {"name": "UC Berkeley", "email_domain": "berkeley.edu"},
    {"name": "UCLA", "email_domain": "ucla.edu"},
    {"name": "New York University", "email_domain": "nyu.edu"},
    {"name": "Test University", "email_domain": "test.edu"},
    {"name": "Test Bebea8 University", "email_domain": "test-bebea8.edu"},
]


def upgrade() -> None:
    universities_table = sa.table(
        'universities',
        sa.column('id', sa.Uuid()),
        sa.column('name', sa.String()),
        sa.column('email_domain', sa.String())
    )
    for uni in SEED_UNIVERSITIES:
        op.execute(
            f"INSERT INTO universities (id, name, email_domain) "
            f"VALUES ('{uuid.uuid4()}', '{uni['name']}', '{uni['email_domain']}') "
            f"ON CONFLICT (email_domain) DO NOTHING;"
        )


def downgrade() -> None:
    for uni in SEED_UNIVERSITIES:
        op.execute(f"DELETE FROM universities WHERE email_domain = '{uni['email_domain']}';")
