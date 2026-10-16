"""Resumes and application.resume_id

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "resumes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("target_role", sa.String(), nullable=True),
        sa.Column("version", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_resumes_owner_id", "resumes", ["owner_id"])

    op.add_column("applications",
                   sa.Column("resume_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_applications_resume", "applications", "resumes",
                           ["resume_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_applications_resume_id", "applications", ["resume_id"])


def downgrade():
    op.drop_index("ix_applications_resume_id", table_name="applications")
    op.drop_constraint("fk_applications_resume", "applications", type_="foreignkey")
    op.drop_column("applications", "resume_id")
    op.drop_index("ix_resumes_owner_id", table_name="resumes")
    op.drop_table("resumes")