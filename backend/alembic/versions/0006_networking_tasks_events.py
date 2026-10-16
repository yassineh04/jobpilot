"""Contacts (networking CRM), tasks, application events, deadlines, notification prefs

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

APPLICATION_STATUSES = ("SAVED", "PREPARING", "APPLIED", "RECRUITER_CONTACT", "ASSESSMENT",
                        "INTERVIEW", "FINAL_INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN")


def upgrade():
    op.add_column("users", sa.Column("email_reminders", sa.Boolean(),
                                     nullable=False, server_default=sa.true()))
    op.add_column("applications", sa.Column("deadline", sa.Date(), nullable=True))

    # Reuse the existing "applicationstatus" enum type, do not recreate it
    status_enum = postgresql.ENUM(*APPLICATION_STATUSES, name="applicationstatus",
                                  create_type=False)
    op.create_table(
        "application_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("application_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.Enum("CREATED", "STATUS_CHANGED", "INTERVIEW_SCHEDULED",
                                        "CONTACT_LINKED", name="eventtype"), nullable=False),
        sa.Column("from_status", status_enum, nullable=True),
        sa.Column("to_status", status_enum, nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_application_events_application_id", "application_events", ["application_id"])
    op.create_index("ix_application_events_occurred_at", "application_events", ["occurred_at"])

    # Backfill: every existing application gets a CREATED event (and an APPLIED one if relevant)
    op.execute("""
        INSERT INTO application_events (id, application_id, event_type, to_status, occurred_at)
        SELECT md5(random()::text || id::text)::uuid, id, 'CREATED', 'SAVED',
               COALESCE(date_saved, created_at, now())
        FROM applications
    """)
    op.execute("""
        INSERT INTO application_events (id, application_id, event_type, from_status, to_status, occurred_at)
        SELECT md5(random()::text || id::text || 'applied')::uuid, id, 'STATUS_CHANGED', 'SAVED',
               status, COALESCE(applied_date, updated_at, now())
        FROM applications WHERE status NOT IN ('SAVED')
    """)

    op.create_table(
        "contacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("users.id"), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("companies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("linkedin_url", sa.String(), nullable=True),
        sa.Column("relationship_type", sa.Enum("RECRUITER", "HIRING_MANAGER", "REFERRAL", "PEER",
                                               "MENTOR", "ALUMNI", "OTHER",
                                               name="relationshiptype"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_interaction_at", sa.Date(), nullable=True),
        sa.Column("next_follow_up_at", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_contacts_owner_id", "contacts", ["owner_id"])
    op.create_index("ix_contacts_company_id", "contacts", ["company_id"])
    op.create_index("ix_contacts_next_follow_up_at", "contacts", ["next_follow_up_at"])

    op.create_table(
        "contact_applications",
        sa.Column("contact_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("application_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("applications.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("users.id"), nullable=False),
        sa.Column("application_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("kind", sa.Enum("FOLLOW_UP", "DEADLINE", "PREPARATION", "NETWORKING", "OTHER",
                                  name="taskkind"), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_tasks_owner_id", "tasks", ["owner_id"])
    op.create_index("ix_tasks_due_date", "tasks", ["due_date"])


def downgrade():
    op.drop_index("ix_tasks_due_date", table_name="tasks")
    op.drop_index("ix_tasks_owner_id", table_name="tasks")
    op.drop_table("tasks")
    op.drop_table("contact_applications")
    op.drop_index("ix_contacts_next_follow_up_at", table_name="contacts")
    op.drop_index("ix_contacts_company_id", table_name="contacts")
    op.drop_index("ix_contacts_owner_id", table_name="contacts")
    op.drop_table("contacts")
    op.drop_index("ix_application_events_occurred_at", table_name="application_events")
    op.drop_index("ix_application_events_application_id", table_name="application_events")
    op.drop_table("application_events")
    sa.Enum(name="taskkind").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="relationshiptype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="eventtype").drop(op.get_bind(), checkfirst=True)
    op.drop_column("applications", "deadline")
    op.drop_column("users", "email_reminders")
