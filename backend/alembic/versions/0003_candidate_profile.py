"""Add candidate profile: education, experience, projects, skills + evidence,
languages, preferences

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "educations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("institution", sa.String(), nullable=False),
        sa.Column("degree", sa.String(), nullable=False),
        sa.Column("field", sa.String(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("gpa", sa.Float(), nullable=True),
    )

    op.create_table(
        "experiences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("company", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("achievements", sa.Text(), nullable=True),
    )

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("repository_url", sa.String(), nullable=True),
        sa.Column("demo_url", sa.String(), nullable=True),
    )

    op.create_table(
        "skills",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("proficiency", sa.Enum("BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT",
                                          name="skillproficiency"), nullable=True),
        sa.Column("years_experience", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("owner_id", "name", name="uq_skill_owner_name"),
    )

    op.create_table(
        "skill_evidences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("skill_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("skills.id"), nullable=False),
        sa.Column("evidence_type", sa.Enum("EXPERIENCE", "PROJECT", "EDUCATION", "CERTIFICATION",
                                            "OTHER", name="evidencetype"), nullable=False),
        sa.Column("source_experience_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("experiences.id"), nullable=True),
        sa.Column("source_project_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("source_education_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("educations.id"), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Enum("LOW", "MEDIUM", "HIGH", name="evidenceconfidence"),
                   nullable=True),
        sa.Column("user_confirmed", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "languages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("proficiency", sa.Enum("BASIC", "CONVERSATIONAL", "FLUENT", "NATIVE",
                                          name="languageproficiency"), nullable=False),
        sa.UniqueConstraint("owner_id", "language", name="uq_language_owner"),
    )

    op.create_table(
        "candidate_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"),
                   nullable=False, unique=True),
        sa.Column("remote_preference",
                   postgresql.ENUM("REMOTE", "HYBRID", "ON_SITE", name="workmode",
                                    create_type=False),
                   nullable=True),
        sa.Column("desired_employment_type",
                   postgresql.ENUM("FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP",
                                    "FREELANCE", name="employmenttype", create_type=False),
                   nullable=True),
        sa.Column("salary_expectation_min", sa.Float(), nullable=True),
        sa.Column("salary_expectation_max", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(), nullable=True),
    )

    op.create_table(
        "preferred_locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("preference_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("candidate_preferences.id"), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
    )

    op.create_table(
        "desired_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("preference_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("candidate_preferences.id"), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
    )


def downgrade():
    op.drop_table("desired_roles")
    op.drop_table("preferred_locations")
    op.drop_table("candidate_preferences")
    op.drop_table("languages")
    op.drop_table("skill_evidences")
    op.drop_table("skills")
    op.drop_table("projects")
    op.drop_table("experiences")
    op.drop_table("educations")