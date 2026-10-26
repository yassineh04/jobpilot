"""Resume files: the uploaded PDF and its extracted text

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("resumes", sa.Column("file_name", sa.String(), nullable=True))
    op.add_column("resumes", sa.Column("file_size", sa.Integer(), nullable=True))
    op.add_column("resumes", sa.Column("file_data", sa.LargeBinary(), nullable=True))
    op.add_column("resumes", sa.Column("content", sa.Text(), nullable=True))


def downgrade():
    for column in ("content", "file_data", "file_size", "file_name"):
        op.drop_column("resumes", column)
