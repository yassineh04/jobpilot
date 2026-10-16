"""Interview fields, question topics, interview question bank

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("interviews", sa.Column("interviewer", sa.String(), nullable=True))
    op.add_column("interviews", sa.Column("duration_minutes", sa.Integer(), nullable=True))
    op.add_column("interviews", sa.Column("stage", sa.String(), nullable=True))
    op.add_column("interviews", sa.Column("self_assessment", sa.Integer(), nullable=True))
    op.add_column("interviews", sa.Column("outcome", sa.String(), nullable=True))
    op.add_column("interviews", sa.Column("follow_up", sa.Text(), nullable=True))

    op.create_table(
        "question_topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.UniqueConstraint("owner_id", "name", name="uq_topic_owner_name"),
    )
    op.create_index("ix_question_topics_owner_id", "question_topics", ["owner_id"])

    op.create_table(
        "interview_questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("users.id"), nullable=False),
        sa.Column("application_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("applications.id", ondelete="SET NULL"), nullable=True),
        sa.Column("interview_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("interviews.id", ondelete="SET NULL"), nullable=True),
        sa.Column("topic_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("question_topics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("company", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("interview_type", sa.String(), nullable=True),
        sa.Column("asked_date", sa.Date(), nullable=True),
        sa.Column("difficulty", sa.Integer(), nullable=True),
        sa.Column("user_answer", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_interview_questions_owner_id", "interview_questions", ["owner_id"])
    op.create_index("ix_interview_questions_topic_id", "interview_questions", ["topic_id"])


def downgrade():
    op.drop_table("interview_questions")
    op.drop_table("question_topics")
    op.drop_column("interviews", "follow_up")
    op.drop_column("interviews", "outcome")
    op.drop_column("interviews", "self_assessment")
    op.drop_column("interviews", "stage")
    op.drop_column("interviews", "duration_minutes")
    op.drop_column("interviews", "interviewer")