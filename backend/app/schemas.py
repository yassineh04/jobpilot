import re
import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator, model_validator
from typing import Optional, List, Literal
from app.models import (ApplicationStatus, WorkMode, EmploymentType,
                         SeniorityLevel, RejectionReason, EventType, RelationshipType, TaskKind)

from datetime import date
from app.models import (SkillProficiency, LanguageProficiency, EvidenceType, EvidenceConfidence)

InterviewOutcome = Literal["PENDING", "PASSED", "FAILED", "UNKNOWN"]

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)  # bcrypt ignores bytes beyond 72
    full_name: Optional[str] = Field(default=None, max_length=120)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: Optional[str] = None
    email_reminders: bool = True


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    email_reminders: Optional[bool] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class InterviewCreate(BaseModel):
    scheduled_at: datetime
    interview_type: Optional[str] = None
    location_or_link: Optional[str] = None
    notes: Optional[str] = None
    interviewer: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    stage: Optional[str] = None
    self_assessment: Optional[int] = Field(default=None, ge=1, le=5)
    outcome: Optional[InterviewOutcome] = None
    follow_up: Optional[str] = None


class InterviewUpdate(BaseModel):
    scheduled_at: Optional[datetime] = None
    interview_type: Optional[str] = None
    location_or_link: Optional[str] = None
    notes: Optional[str] = None
    interviewer: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    stage: Optional[str] = None
    self_assessment: Optional[int] = Field(default=None, ge=1, le=5)
    outcome: Optional[InterviewOutcome] = None
    follow_up: Optional[str] = None


class InterviewOut(InterviewCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    reminder_sent: bool


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    website: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None


class CompanyUpdate(BaseModel):
    website: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    notes: Optional[str] = None


class ApplicationCreate(BaseModel):
    company_name: str
    position_title: str
    job_description: Optional[str] = None
    job_url: Optional[str] = None

    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: Optional[str] = "CAD"

    location: Optional[str] = None
    work_mode: Optional[WorkMode] = None
    employment_type: Optional[EmploymentType] = None
    seniority: Optional[SeniorityLevel] = None
    source: Optional[str] = None

    notes: Optional[str] = None
    status: ApplicationStatus = ApplicationStatus.SAVED
    rejection_reason: Optional[RejectionReason] = None
    tags: List[str] = []
    resume_id: Optional[uuid.UUID] = None
    deadline: Optional[date] = None


class ApplicationUpdate(BaseModel):
    company_name: Optional[str] = None
    position_title: Optional[str] = None
    job_description: Optional[str] = None
    job_url: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    location: Optional[str] = None
    work_mode: Optional[WorkMode] = None
    employment_type: Optional[EmploymentType] = None
    seniority: Optional[SeniorityLevel] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[ApplicationStatus] = None
    rejection_reason: Optional[RejectionReason] = None
    tags: Optional[List[str]] = None
    resume_id: Optional[uuid.UUID] = None
    deadline: Optional[date] = None
    currency: Optional[str] = None
    applied_date: Optional[datetime] = None  # lets an undo restore the original date


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_name: str
    company: CompanyOut
    position_title: str
    job_description: Optional[str] = None
    job_url: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: str
    location: Optional[str] = None
    work_mode: Optional[WorkMode] = None
    employment_type: Optional[EmploymentType] = None
    seniority: Optional[SeniorityLevel] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    status: ApplicationStatus
    rejection_reason: Optional[RejectionReason] = None
    date_saved: datetime
    applied_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    interviews: List[InterviewOut] = []
    tags: List[str] = []
    resume_id: Optional[uuid.UUID] = None
    deadline: Optional[date] = None

    @field_validator("tags", mode="before")
    @classmethod
    def _tags_to_strings(cls, value):
        return [t.tag if hasattr(t, "tag") else t for t in (value or [])]


class StatsOut(BaseModel):
    total: int
    by_status: dict
    conversion_rate_interview: float
    conversion_rate_offer: float
    avg_salary_min: Optional[float]
    avg_salary_max: Optional[float]
    applications_per_month: dict

class EducationIn(BaseModel):
    institution: str
    degree: str
    field: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    gpa: Optional[float] = None


class EducationOut(EducationIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ExperienceIn(BaseModel):
    company: str
    title: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    achievements: Optional[str] = None


class ExperienceOut(ExperienceIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ProjectIn(BaseModel):
    name: str
    description: Optional[str] = None
    repository_url: Optional[str] = None
    demo_url: Optional[str] = None


class ProjectOut(ProjectIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class SkillEvidenceIn(BaseModel):
    evidence_type: EvidenceType
    source_experience_id: Optional[uuid.UUID] = None
    source_project_id: Optional[uuid.UUID] = None
    source_education_id: Optional[uuid.UUID] = None
    description: str
    confidence: EvidenceConfidence = EvidenceConfidence.MEDIUM


class SkillEvidenceOut(SkillEvidenceIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    skill_id: uuid.UUID
    user_confirmed: bool
    created_at: datetime


class SkillIn(BaseModel):
    name: str
    category: Optional[str] = None
    proficiency: Optional[SkillProficiency] = None
    years_experience: Optional[float] = None


class SkillOut(SkillIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime
    evidences: List[SkillEvidenceOut] = []


class LanguageIn(BaseModel):
    language: str
    proficiency: LanguageProficiency


class LanguageOut(LanguageIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class CandidatePreferenceIn(BaseModel):
    remote_preference: Optional[WorkMode] = None
    desired_employment_type: Optional[EmploymentType] = None
    salary_expectation_min: Optional[float] = None
    salary_expectation_max: Optional[float] = None
    currency: Optional[str] = "CAD"
    locations: List[str] = []
    desired_roles: List[str] = []


class CandidatePreferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    remote_preference: Optional[WorkMode] = None
    desired_employment_type: Optional[EmploymentType] = None
    salary_expectation_min: Optional[float] = None
    salary_expectation_max: Optional[float] = None
    currency: str
    locations: List[str] = []
    desired_roles: List[str] = []

    @field_validator("locations", mode="before")
    @classmethod
    def _locations_to_strings(cls, value):
        return [x.location if hasattr(x, "location") else x for x in (value or [])]

    @field_validator("desired_roles", mode="before")
    @classmethod
    def _roles_to_strings(cls, value):
        return [x.role if hasattr(x, "role") else x for x in (value or [])]

class TopicIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class TopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str


class QuestionIn(BaseModel):
    question: str = Field(min_length=1)
    application_id: Optional[uuid.UUID] = None
    interview_id: Optional[uuid.UUID] = None
    topic_id: Optional[uuid.UUID] = None
    company: Optional[str] = None
    role: Optional[str] = None
    interview_type: Optional[str] = None
    asked_date: Optional[date] = None
    difficulty: Optional[int] = Field(default=None, ge=1, le=5)
    user_answer: Optional[str] = None
    confidence: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = None


class QuestionUpdate(BaseModel):
    question: Optional[str] = Field(default=None, min_length=1)
    application_id: Optional[uuid.UUID] = None
    interview_id: Optional[uuid.UUID] = None
    topic_id: Optional[uuid.UUID] = None
    company: Optional[str] = None
    role: Optional[str] = None
    interview_type: Optional[str] = None
    asked_date: Optional[date] = None
    difficulty: Optional[int] = Field(default=None, ge=1, le=5)
    user_answer: Optional[str] = None
    confidence: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = None


class QuestionOut(QuestionIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    topic_name: Optional[str] = None
    created_at: datetime

class ResumeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_role: Optional[str] = None
    version: Optional[str] = None
    notes: Optional[str] = None


class ResumeOut(ResumeIn):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    application_count: int = 0
    file_name: Optional[str] = None
    file_size: Optional[int] = None


class ApplicationRef(BaseModel):
    """Compact application reference embedded in other resources."""
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    company_name: str
    position_title: str
    status: ApplicationStatus


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    application_id: uuid.UUID
    event_type: EventType
    from_status: Optional[ApplicationStatus] = None
    to_status: Optional[ApplicationStatus] = None
    description: Optional[str] = None
    occurred_at: datetime


class TimelineEventOut(EventOut):
    company_name: str
    position_title: str


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    company_name: Optional[str] = Field(default=None, max_length=120)
    role: Optional[str] = None
    email: Optional[EmailStr] = None
    linkedin_url: Optional[str] = None
    relationship_type: Optional[RelationshipType] = None
    notes: Optional[str] = None
    last_interaction_at: Optional[date] = None
    next_follow_up_at: Optional[date] = None
    application_ids: List[uuid.UUID] = []

    @field_validator("email", "linkedin_url", "company_name", "role", mode="before")
    @classmethod
    def _blank_to_none(cls, value):
        return None if isinstance(value, str) and not value.strip() else value


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    company_id: Optional[uuid.UUID] = None
    company_name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    relationship_type: Optional[RelationshipType] = None
    notes: Optional[str] = None
    last_interaction_at: Optional[date] = None
    next_follow_up_at: Optional[date] = None
    created_at: datetime
    applications: List[ApplicationRef] = []


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: TaskKind = TaskKind.OTHER
    due_date: Optional[date] = None
    application_id: Optional[uuid.UUID] = None
    contact_id: Optional[uuid.UUID] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    kind: Optional[TaskKind] = None
    due_date: Optional[date] = None
    application_id: Optional[uuid.UUID] = None
    contact_id: Optional[uuid.UUID] = None
    done: Optional[bool] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    kind: TaskKind
    due_date: Optional[date] = None
    done: bool
    completed_at: Optional[datetime] = None
    created_at: datetime
    application_id: Optional[uuid.UUID] = None
    contact_id: Optional[uuid.UUID] = None
    application: Optional[ApplicationRef] = None
    contact_name: Optional[str] = None


class JobParseIn(BaseModel):
    text: str = Field(min_length=20, max_length=30000)
    use_ai: bool = True


def _to_number(value):
    if isinstance(value, str):
        digits = re.sub(r"[^\d.kK]", "", value)
        if not digits:
            return None
        if digits.lower().endswith("k"):
            return float(digits[:-1] or 0) * 1000
        return float(digits)
    return value


class SalaryRange(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    currency: Optional[str] = None

    @field_validator("min", "max", mode="before")
    @classmethod
    def _numbers(cls, value):
        return _to_number(value)

    @field_validator("currency", mode="before")
    @classmethod
    def _currency(cls, value):
        if not isinstance(value, str) or not value.strip():
            return None
        return {"$": None, "€": "EUR", "£": "GBP"}.get(value.strip(), value.strip().upper()[:3])


_ENUMS = {"work_mode": WorkMode, "employment_type": EmploymentType, "seniority": SeniorityLevel}
_LISTS = ("required_skills", "preferred_skills", "education_requirements", "experience_requirements",
          "languages", "certifications", "responsibilities", "benefits")


class ParsedJob(BaseModel):
    """Structured job posting. Unknown fields stay null/empty - never invented."""

    @model_validator(mode="before")
    @classmethod
    def _lenient(cls, data):
        """Normalizes common LLM quirks (null lists, lowercase enums, "on-site") instead of failing."""
        if not isinstance(data, dict):
            return data
        data = dict(data)
        for key in _LISTS:
            value = data.get(key)
            data[key] = [str(v).strip() for v in value if v and str(v).strip()][:20] \
                if isinstance(value, list) else []
        for key, enum in _ENUMS.items():
            value = data.get(key)
            if isinstance(value, str):
                normalized = re.sub(r"[\s-]+", "_", value.strip().upper())
                normalized = {"ONSITE": "ON_SITE", "FULLTIME": "FULL_TIME", "PARTTIME": "PART_TIME",
                              "MID_LEVEL": "MID", "INTERMEDIATE": "MID"}.get(normalized, normalized)
                data[key] = normalized if normalized in enum.__members__ else None
            else:
                data[key] = None
        if not isinstance(data.get("salary"), (dict, SalaryRange)):
            data["salary"] = {}
        for key in ("title", "company", "location"):
            if not isinstance(data.get(key), str) or not data[key].strip():
                data[key] = None
        return data

    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    work_mode: Optional[WorkMode] = None
    employment_type: Optional[EmploymentType] = None
    seniority: Optional[SeniorityLevel] = None
    salary: SalaryRange = SalaryRange()
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    education_requirements: List[str] = []
    experience_requirements: List[str] = []
    languages: List[str] = []
    certifications: List[str] = []
    responsibilities: List[str] = []
    benefits: List[str] = []


class JobParseOut(BaseModel):
    job: ParsedJob
    method: Literal["ai", "rules"]
    notice: Optional[str] = None


class JobImportIn(BaseModel):
    url: str = Field(min_length=4, max_length=2000)
    use_ai: bool = True


class JobImportOut(JobParseOut):
    text: str
    url: str
    source: str


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantIn(BaseModel):
    messages: List[AssistantMessage] = Field(min_length=1, max_length=30)


class AssistantToolCall(BaseModel):
    name: str
    input: dict


class AssistantSourceItem(BaseModel):
    label: str
    detail: str = ""
    href: str


class AssistantSource(BaseModel):
    title: str
    items: List[AssistantSourceItem]


class AssistantOut(BaseModel):
    reply: str
    tool_calls: List[AssistantToolCall] = []
    sources: List[AssistantSource] = []

class AgentContext(BaseModel):
    path: Optional[str] = Field(default=None, max_length=200)
    local_time: Optional[str] = Field(default=None, max_length=40)


class AgentIn(BaseModel):
    messages: List[AssistantMessage] = Field(min_length=1, max_length=30)
    context: AgentContext = AgentContext()


class AgentProposal(BaseModel):
    id: str
    tool: str
    input: dict
    title: str
    detail: str = ""


class AgentOut(BaseModel):
    reply: str
    steps: List[str] = []
    sources: List[AssistantSource] = []
    actions: List[AgentProposal] = []
    mode: Literal["agent", "read_only"] = "agent"


class AgentActionIn(BaseModel):
    tool: str = Field(max_length=60)
    input: dict
    tz_offset_minutes: int = Field(default=0, ge=-900, le=900)


class AgentActionOut(BaseModel):
    ok: bool
    message: str
    href: str


# ---------- CV import ----------
class CVExperienceItem(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    current: bool = False
    achievements: Optional[str] = None
    exists: bool = False


class CVEducationItem(EducationIn):
    exists: bool = False


class CVProjectItem(ProjectIn):
    exists: bool = False


class CVSkillItem(BaseModel):
    name: str
    category: Optional[str] = None
    exists: bool = False


class CVLanguageItem(LanguageIn):
    exists: bool = False


class CVParseOut(BaseModel):
    method: Literal["ai", "rules"]
    notice: Optional[str] = None
    pages: int
    removed: int = 0
    resume: Optional[ResumeOut] = None
    full_name: str = ""
    headline: str = ""
    experiences: List[CVExperienceItem] = []
    education: List[CVEducationItem] = []
    projects: List[CVProjectItem] = []
    skills: List[CVSkillItem] = []
    languages: List[CVLanguageItem] = []


class CVImportIn(BaseModel):
    experiences: List[ExperienceIn] = Field(default=[], max_length=30)
    education: List[EducationIn] = Field(default=[], max_length=20)
    projects: List[ProjectIn] = Field(default=[], max_length=30)
    skills: List[str] = Field(default=[], max_length=100)
    languages: List[LanguageIn] = Field(default=[], max_length=20)

    @field_validator("skills")
    @classmethod
    def _skills(cls, value):
        return [s.strip()[:60] for s in value if s and s.strip()]


class CVImportOut(BaseModel):
    experiences: int
    education: int
    projects: int
    skills: int
    languages: int
    evidence: int


class CVKeyword(BaseModel):
    skill: str
    in_cv: bool


class CVCheckResume(BaseModel):
    id: uuid.UUID
    name: str
    version: Optional[str] = None
    attached: bool


class CVCheckOut(BaseModel):
    status: Literal["ok", "no_posting", "no_resume"]
    resume: Optional[CVCheckResume] = None
    required: List[CVKeyword] = []
    preferred: List[CVKeyword] = []
    coverage: Optional[int] = None
