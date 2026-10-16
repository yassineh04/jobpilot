"""Add Company entity and job metadata (pipeline enum already extended in 0001)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-02
"""
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("website", sa.String(), nullable=True),
        sa.Column("industry", sa.String(), nullable=True),
        sa.Column("size", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("owner_id", "name", name="uq_company_owner_name"),
    )

    rows = conn.execute(sa.text(
        "SELECT DISTINCT owner_id, company_name FROM applications"
    )).fetchall()

    company_map = {}
    for owner_id, name in rows:
        cid = uuid.uuid4()
        company_map[(str(owner_id), name)] = cid
        conn.execute(
            sa.text("INSERT INTO companies (id, owner_id, name, created_at) "
                    "VALUES (:id, :owner_id, :name, now())"),
            {"id": str(cid), "owner_id": str(owner_id), "name": name},
        )

    op.add_column("applications",
                   sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True))

    for (owner_id, name), cid in company_map.items():
        conn.execute(
            sa.text("UPDATE applications SET company_id = :cid "
                    "WHERE owner_id = :owner_id AND company_name = :name"),
            {"cid": str(cid), "owner_id": owner_id, "name": name},
        )

    op.alter_column("applications", "company_id", nullable=False)
    op.create_foreign_key("fk_applications_company", "applications",
                           "companies", ["company_id"], ["id"])
    op.drop_column("applications", "company_name")

    workmode_enum = sa.Enum("REMOTE", "HYBRID", "ON_SITE", name="workmode")
    employmenttype_enum = sa.Enum("FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP",
                                   "FREELANCE", name="employmenttype")
    seniority_enum = sa.Enum("INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "STAFF",
                              "PRINCIPAL", name="senioritylevel")
    rejectionreason_enum = sa.Enum("EXPERIENCE", "SKILLS", "LOCATION", "COMPENSATION",
                                    "WORK_AUTHORIZATION", "ASSESSMENT", "INTERVIEW",
                                    "RESUME", "UNKNOWN", "OTHER", name="rejectionreason")

    workmode_enum.create(conn, checkfirst=True)
    employmenttype_enum.create(conn, checkfirst=True)
    seniority_enum.create(conn, checkfirst=True)
    rejectionreason_enum.create(conn, checkfirst=True)

    op.add_column("applications", sa.Column("job_description", sa.Text(), nullable=True))
    op.add_column("applications", sa.Column("source", sa.String(), nullable=True))
    op.add_column("applications", sa.Column("date_saved", sa.DateTime(), nullable=True))
    op.add_column("applications", sa.Column("work_mode", workmode_enum, nullable=True))
    op.add_column("applications", sa.Column("employment_type", employmenttype_enum, nullable=True))
    op.add_column("applications", sa.Column("seniority", seniority_enum, nullable=True))
    op.add_column("applications", sa.Column("rejection_reason", rejectionreason_enum, nullable=True))

    op.execute("UPDATE applications SET date_saved = created_at WHERE date_saved IS NULL")
    op.alter_column("applications", "applied_date", nullable=True)

    op.create_table(
        "application_tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("application_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("tag", sa.String(), nullable=False),
    )
    op.create_index("ix_application_tags_application_id", "application_tags", ["application_id"])
    op.create_index("ix_application_tags_tag", "application_tags", ["tag"])


def downgrade():
    op.drop_index("ix_application_tags_tag", table_name="application_tags")
    op.drop_index("ix_application_tags_application_id", table_name="application_tags")
    op.drop_table("application_tags")
    op.drop_column("applications", "rejection_reason")
    op.drop_column("applications", "seniority")
    op.drop_column("applications", "employment_type")
    op.drop_column("applications", "work_mode")
    op.drop_column("applications", "date_saved")
    op.drop_column("applications", "source")
    op.drop_column("applications", "job_description")
    op.add_column("applications", sa.Column("company_name", sa.String(), nullable=True))
    op.execute("UPDATE applications a SET company_name = c.name "
               "FROM companies c WHERE a.company_id = c.id")
    op.alter_column("applications", "company_name", nullable=False)
    op.drop_constraint("fk_applications_company", "applications", type_="foreignkey")
    op.drop_column("applications", "company_id")
    op.drop_table("companies")