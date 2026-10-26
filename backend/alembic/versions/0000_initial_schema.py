"""Initial schema: users, applications, interviews

Revision ID: 0000
Revises:
Create Date: 2026-10-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0000"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("company_name", sa.String(), nullable=False),
        sa.Column("position_title", sa.String(), nullable=False),
        sa.Column("salary_min", sa.Float(), nullable=True),
        sa.Column("salary_max", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("job_url", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.Enum("APPLIED", "INTERVIEW", "OFFER", "REJECTED",
                                     name="applicationstatus"), nullable=False),
        sa.Column("applied_date", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "interviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("application_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(), nullable=False),
        sa.Column("interview_type", sa.String(), nullable=True),
        sa.Column("location_or_link", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("reminder_sent", sa.Boolean(), nullable=True),
    )


def downgrade():
    op.drop_table("interviews")
    op.drop_table("applications")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")