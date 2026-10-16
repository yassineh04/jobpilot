import enum
import uuid
from datetime import datetime
from sqlalchemy import (Column, String, Integer, Float, DateTime, Enum,
                         ForeignKey, Boolean, Text, UniqueConstraint, Table, JSON)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import backref, relationship
from app.database import Base
from sqlalchemy import Date


class ApplicationStatus(str, enum.Enum):
    SAVED = "SAVED"
    PREPARING = "PREPARING"
    APPLIED = "APPLIED"
    RECRUITER_CONTACT = "RECRUITER_CONTACT"
    ASSESSMENT = "ASSESSMENT"
    INTERVIEW = "INTERVIEW"
    FINAL_INTERVIEW = "FINAL_INTERVIEW"
    OFFER = "OFFER"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"


class WorkMode(str, enum.Enum):
    REMOTE = "REMOTE"
    HYBRID = "HYBRID"
    ON_SITE = "ON_SITE"


class EmploymentType(str, enum.Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    INTERNSHIP = "INTERNSHIP"
    FREELANCE = "FREELANCE"


class SeniorityLevel(str, enum.Enum):
    INTERN = "INTERN"
    JUNIOR = "JUNIOR"
    MID = "MID"
    SENIOR = "SENIOR"
    LEAD = "LEAD"
    STAFF = "STAFF"
    PRINCIPAL = "PRINCIPAL"


class RejectionReason(str, enum.Enum):
    EXPERIENCE = "EXPERIENCE"
    SKILLS = "SKILLS"
    LOCATION = "LOCATION"
    COMPENSATION = "COMPENSATION"
    WORK_AUTHORIZATION = "WORK_AUTHORIZATION"
    ASSESSMENT = "ASSESSMENT"
    INTERVIEW = "INTERVIEW"
    RESUME = "RESUME"
    UNKNOWN = "UNKNOWN"
    OTHER = "OTHER"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    email_reminders = Column(Boolean, default=True, nullable=False, server_default="true")
    # Bumped on password change: tokens carrying an older version stop working
    token_version = Column(Integer, default=0, nullable=False, server_default="0")
    created_at = Column(DateTime, default=datetime.utcnow)

    applications = relationship("Application", back_populates="owner",
                                 cascade="all, delete-orphan")
    companies = relationship("Company", back_populates="owner",
                              cascade="all, delete-orphan")


class Company(Base):
    """Central entity: prevents duplicated company data across applications."""
    __tablename__ = "companies"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_company_owner_name"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    name = Column(String, nullable=False, index=True)
    website = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    size = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="companies")
    applications = relationship("Application", back_populates="company")


class ApplicationTag(Base):
    __tablename__ = "application_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False)
    tag = Column(String, nullable=False, index=True)

    application = relationship("Application", back_populates="tags")


class Application(Base):
    __tablename__ = "applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    resume_id = Column(UUID(as_uuid=True),
                        ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True, index=True)

    position_title = Column(String, nullable=False)
    job_description = Column(Text, nullable=True)
    job_url = Column(String, nullable=True)

    salary_min = Column(Float, nullable=True)
    salary_max = Column(Float, nullable=True)
    currency = Column(String, default="CAD")

    location = Column(String, nullable=True)
    work_mode = Column(Enum(WorkMode), nullable=True)
    employment_type = Column(Enum(EmploymentType), nullable=True)
    seniority = Column(Enum(SeniorityLevel), nullable=True)
    source = Column(String, nullable=True)  # e.g. "LinkedIn", "Referral"

    notes = Column(Text, nullable=True)
    status = Column(Enum(ApplicationStatus), default=ApplicationStatus.SAVED, nullable=False)
    rejection_reason = Column(Enum(RejectionReason), nullable=True)

    date_saved = Column(DateTime, default=datetime.utcnow)
    applied_date = Column(DateTime, nullable=True)
    deadline = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="applications")
    company = relationship("Company", back_populates="applications")
    interviews = relationship("Interview", back_populates="application",
                               cascade="all, delete-orphan")
    tags = relationship("ApplicationTag", back_populates="application",
                         cascade="all, delete-orphan")
    events = relationship("ApplicationEvent", back_populates="application",
                           cascade="all, delete-orphan",
                           order_by="ApplicationEvent.occurred_at")
    contacts = relationship("Contact", secondary="contact_applications",
                             back_populates="applications")

    @property
    def company_name(self) -> str:
        """Kept for API/frontend backward compatibility."""
        return self.company.name if self.company else ""

    @property
    def tag_list(self) -> list[str]:
        return [t.tag for t in self.tags]


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False)

    scheduled_at = Column(DateTime, nullable=False)
    interview_type = Column(String, nullable=True)
    location_or_link = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    reminder_sent = Column(Boolean, default=False)
    
    interviewer = Column(String, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    stage = Column(String, nullable=True)
    self_assessment = Column(Integer, nullable=True)
    outcome = Column(String, nullable=True)
    follow_up = Column(Text, nullable=True)

    application = relationship("Application", back_populates="interviews")
    
class SkillProficiency(str, enum.Enum):
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"
    EXPERT = "EXPERT"


class LanguageProficiency(str, enum.Enum):
    BASIC = "BASIC"
    CONVERSATIONAL = "CONVERSATIONAL"
    FLUENT = "FLUENT"
    NATIVE = "NATIVE"


class EvidenceType(str, enum.Enum):
    EXPERIENCE = "EXPERIENCE"
    PROJECT = "PROJECT"
    EDUCATION = "EDUCATION"
    CERTIFICATION = "CERTIFICATION"
    OTHER = "OTHER"


class EvidenceConfidence(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class Education(Base):
    __tablename__ = "educations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    institution = Column(String, nullable=False)
    degree = Column(String, nullable=False)
    field = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    gpa = Column(Float, nullable=True)

    owner = relationship("User")
    evidences = relationship("SkillEvidence", back_populates="source_education")


class Experience(Base):
    __tablename__ = "experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    company = Column(String, nullable=False)
    title = Column(String, nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)  # null = current position
    description = Column(Text, nullable=True)
    achievements = Column(Text, nullable=True)

    owner = relationship("User")
    evidences = relationship("SkillEvidence", back_populates="source_experience")


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    repository_url = Column(String, nullable=True)
    demo_url = Column(String, nullable=True)

    owner = relationship("User")
    evidences = relationship("SkillEvidence", back_populates="source_project")


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_skill_owner_name"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    name = Column(String, nullable=False)
    category = Column(String, nullable=True)  # e.g. "Language", "Framework", "Cloud"
    proficiency = Column(Enum(SkillProficiency), nullable=True)
    years_experience = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User")
    evidences = relationship("SkillEvidence", back_populates="skill",
                              cascade="all, delete-orphan")


class SkillEvidence(Base):
    __tablename__ = "skill_evidences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    skill_id = Column(UUID(as_uuid=True), ForeignKey("skills.id"), nullable=False)

    evidence_type = Column(Enum(EvidenceType), nullable=False)
    source_experience_id = Column(UUID(as_uuid=True), ForeignKey("experiences.id"), nullable=True)
    source_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    source_education_id = Column(UUID(as_uuid=True), ForeignKey("educations.id"), nullable=True)

    description = Column(Text, nullable=False)
    confidence = Column(Enum(EvidenceConfidence), default=EvidenceConfidence.MEDIUM)
    user_confirmed = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    skill = relationship("Skill", back_populates="evidences")
    source_experience = relationship("Experience", back_populates="evidences")
    source_project = relationship("Project", back_populates="evidences")
    source_education = relationship("Education", back_populates="evidences")


class Language(Base):
    __tablename__ = "languages"
    __table_args__ = (UniqueConstraint("owner_id", "language", name="uq_language_owner"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    language = Column(String, nullable=False)
    proficiency = Column(Enum(LanguageProficiency), nullable=False)

    owner = relationship("User")


class CandidatePreference(Base):
    """One row per user."""
    __tablename__ = "candidate_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)

    remote_preference = Column(Enum(WorkMode), nullable=True)
    desired_employment_type = Column(Enum(EmploymentType), nullable=True)
    salary_expectation_min = Column(Float, nullable=True)
    salary_expectation_max = Column(Float, nullable=True)
    currency = Column(String, default="CAD")

    owner = relationship("User")
    locations = relationship("PreferredLocation", back_populates="preference",
                              cascade="all, delete-orphan")
    desired_roles = relationship("DesiredRole", back_populates="preference",
                                  cascade="all, delete-orphan")


class PreferredLocation(Base):
    __tablename__ = "preferred_locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    preference_id = Column(UUID(as_uuid=True), ForeignKey("candidate_preferences.id"), nullable=False)
    location = Column(String, nullable=False)

    preference = relationship("CandidatePreference", back_populates="locations")


class DesiredRole(Base):
    __tablename__ = "desired_roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    preference_id = Column(UUID(as_uuid=True), ForeignKey("candidate_preferences.id"), nullable=False)
    role = Column(String, nullable=False)

    preference = relationship("CandidatePreference", back_populates="desired_roles")
    
class QuestionTopic(Base):
    """User-extensible topic list (algorithms, SQL, system design, ...)."""
    __tablename__ = "question_topics"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_topic_owner_name"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)

    owner = relationship("User")


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    application_id = Column(UUID(as_uuid=True),
                             ForeignKey("applications.id", ondelete="SET NULL"), nullable=True)
    interview_id = Column(UUID(as_uuid=True),
                           ForeignKey("interviews.id", ondelete="SET NULL"), nullable=True)
    topic_id = Column(UUID(as_uuid=True),
                       ForeignKey("question_topics.id", ondelete="SET NULL"), nullable=True, index=True)

    question = Column(Text, nullable=False)
    company = Column(String, nullable=True)
    role = Column(String, nullable=True)
    interview_type = Column(String, nullable=True)
    asked_date = Column(Date, nullable=True)
    difficulty = Column(Integer, nullable=True)   # 1-5
    user_answer = Column(Text, nullable=True)
    confidence = Column(Integer, nullable=True)   # 1-5, self-reported
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User")
    topic = relationship("QuestionTopic")

    @property
    def topic_name(self):
        return self.topic.name if self.topic else None
    
class Resume(Base):
    __tablename__ = "resumes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    name = Column(String, nullable=False)
    target_role = Column(String, nullable=True)
    version = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User")


class EventType(str, enum.Enum):
    CREATED = "CREATED"
    STATUS_CHANGED = "STATUS_CHANGED"
    INTERVIEW_SCHEDULED = "INTERVIEW_SCHEDULED"
    CONTACT_LINKED = "CONTACT_LINKED"


class ApplicationEvent(Base):
    """Append-only history of an application, used for the timeline and timing analytics."""
    __tablename__ = "application_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True),
                             ForeignKey("applications.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    event_type = Column(Enum(EventType), nullable=False)
    from_status = Column(Enum(ApplicationStatus), nullable=True)
    to_status = Column(Enum(ApplicationStatus), nullable=True)
    description = Column(String, nullable=True)
    occurred_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    application = relationship("Application", back_populates="events")


class RelationshipType(str, enum.Enum):
    RECRUITER = "RECRUITER"
    HIRING_MANAGER = "HIRING_MANAGER"
    REFERRAL = "REFERRAL"
    PEER = "PEER"
    MENTOR = "MENTOR"
    ALUMNI = "ALUMNI"
    OTHER = "OTHER"


contact_applications = Table(
    "contact_applications",
    Base.metadata,
    Column("contact_id", UUID(as_uuid=True),
           ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True),
    Column("application_id", UUID(as_uuid=True),
           ForeignKey("applications.id", ondelete="CASCADE"), primary_key=True),
)


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    company_id = Column(UUID(as_uuid=True),
                         ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True)

    name = Column(String, nullable=False)
    role = Column(String, nullable=True)
    email = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    relationship_type = Column(Enum(RelationshipType), nullable=True)
    notes = Column(Text, nullable=True)
    last_interaction_at = Column(Date, nullable=True)
    next_follow_up_at = Column(Date, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User")
    company = relationship("Company")
    applications = relationship("Application", secondary=contact_applications,
                                 back_populates="contacts")

    @property
    def company_name(self):
        return self.company.name if self.company else None


class TaskKind(str, enum.Enum):
    FOLLOW_UP = "FOLLOW_UP"
    DEADLINE = "DEADLINE"
    PREPARATION = "PREPARATION"
    NETWORKING = "NETWORKING"
    OTHER = "OTHER"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    application_id = Column(UUID(as_uuid=True),
                             ForeignKey("applications.id", ondelete="CASCADE"), nullable=True)
    contact_id = Column(UUID(as_uuid=True),
                         ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True)

    title = Column(String, nullable=False)
    kind = Column(Enum(TaskKind), default=TaskKind.OTHER, nullable=False)
    due_date = Column(Date, nullable=True, index=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    application = relationship("Application")
    contact = relationship("Contact")

    @property
    def done(self) -> bool:
        return self.completed_at is not None


class ApplicationBrief(Base):
    """Latest AI brief for an application (verified content), cached so it is not regenerated on every view."""
    __tablename__ = "application_briefs"

    application_id = Column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"),
                            primary_key=True)
    content = Column(JSON, nullable=False)
    model = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    application = relationship("Application", backref=backref("brief", uselist=False,
                                                               cascade="all, delete-orphan"))