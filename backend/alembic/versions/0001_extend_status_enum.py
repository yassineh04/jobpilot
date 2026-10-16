"""Extend ApplicationStatus enum with new pipeline stages

Revision ID: 0001
Revises: 0000
Create Date: 2026-10-02
"""
from alembic import op

revision = "0001"
down_revision = "0000"
branch_labels = None
depends_on = None

NEW_STATUSES = ["SAVED", "PREPARING", "RECRUITER_CONTACT", "ASSESSMENT",
                 "FINAL_INTERVIEW", "WITHDRAWN"]


def upgrade():
    with op.get_context().autocommit_block():
        for value in NEW_STATUSES:
            op.execute(f"ALTER TYPE applicationstatus ADD VALUE IF NOT EXISTS '{value}'")


def downgrade():
    # Postgres cannot drop enum values cleanly — no-op.
    pass