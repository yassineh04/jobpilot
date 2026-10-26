export type Status =
  | "SAVED" | "PREPARING" | "APPLIED" | "RECRUITER_CONTACT" | "ASSESSMENT"
  | "INTERVIEW" | "FINAL_INTERVIEW" | "OFFER" | "REJECTED" | "WITHDRAWN";
export type WorkMode = "REMOTE" | "HYBRID" | "ON_SITE";
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | "FREELANCE";
export type Seniority = "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "STAFF" | "PRINCIPAL";
export type RejectionReason =
  | "EXPERIENCE" | "SKILLS" | "LOCATION" | "COMPENSATION" | "WORK_AUTHORIZATION"
  | "ASSESSMENT" | "INTERVIEW" | "RESUME" | "UNKNOWN" | "OTHER";
export type EventType = "CREATED" | "STATUS_CHANGED" | "INTERVIEW_SCHEDULED" | "CONTACT_LINKED";
export type RelationshipType =
  | "RECRUITER" | "HIRING_MANAGER" | "REFERRAL" | "PEER" | "MENTOR" | "ALUMNI" | "OTHER";
export type TaskKind = "FOLLOW_UP" | "DEADLINE" | "PREPARATION" | "NETWORKING" | "OTHER";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  email_reminders: boolean;
}

export interface Company {
  id: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  size?: string | null;
}

export interface Interview {
  id: string;
  application_id: string;
  scheduled_at: string;
  interview_type?: string | null;
  location_or_link?: string | null;
  notes?: string | null;
  interviewer?: string | null;
  duration_minutes?: number | null;
  stage?: string | null;
  self_assessment?: number | null;
  outcome?: "PENDING" | "PASSED" | "FAILED" | "UNKNOWN" | null;
  follow_up?: string | null;
  reminder_sent: boolean;
}

export interface Application {
  id: string;
  company_name: string;
  company: Company;
  position_title: string;
  job_description?: string | null;
  job_url?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency: string;
  location?: string | null;
  work_mode?: WorkMode | null;
  employment_type?: EmploymentType | null;
  seniority?: Seniority | null;
  source?: string | null;
  notes?: string | null;
  status: Status;
  rejection_reason?: RejectionReason | null;
  date_saved: string;
  applied_date?: string | null;
  deadline?: string | null;
  created_at: string;
  updated_at: string;
  interviews: Interview[];
  tags: string[];
  resume_id?: string | null;
}

export interface ApplicationRef {
  id: string;
  company_name: string;
  position_title: string;
  status: Status;
}

export interface AppEvent {
  id: string;
  application_id: string;
  event_type: EventType;
  from_status: Status | null;
  to_status: Status | null;
  description: string | null;
  occurred_at: string;
}

export interface Resume {
  id: string;
  name: string;
  target_role?: string | null;
  version?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  application_count: number;
  file_name?: string | null;
  file_size?: number | null;
}

export interface Contact {
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  role: string | null;
  email: string | null;
  linkedin_url: string | null;
  relationship_type: RelationshipType | null;
  notes: string | null;
  last_interaction_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  applications: ApplicationRef[];
}

export interface Task {
  id: string;
  title: string;
  kind: TaskKind;
  due_date: string | null;
  done: boolean;
  completed_at: string | null;
  created_at: string;
  application_id: string | null;
  contact_id: string | null;
  application: ApplicationRef | null;
  contact_name: string | null;
}

export interface Topic { id: string; name: string }

export interface Question {
  id: string;
  question: string;
  application_id?: string | null;
  interview_id?: string | null;
  topic_id?: string | null;
  topic_name?: string | null;
  company?: string | null;
  role?: string | null;
  interview_type?: string | null;
  asked_date?: string | null;
  difficulty?: number | null;
  user_answer?: string | null;
  confidence?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface ParsedJob {
  title: string | null;
  company: string | null;
  location: string | null;
  work_mode: WorkMode | null;
  employment_type: EmploymentType | null;
  seniority: Seniority | null;
  salary: { min: number | null; max: number | null; currency: string | null };
  required_skills: string[];
  preferred_skills: string[];
  education_requirements: string[];
  experience_requirements: string[];
  languages: string[];
  certifications: string[];
  responsibilities: string[];
  benefits: string[];
}

export interface MatchResult {
  overall: number | null;
  components: Record<
    "technical" | "experience" | "education" | "location" | "preferences",
    { score: number | null; weight: number; effective_weight: number | null; detail?: unknown }
  >;
  constraints: string[];
  unavailable_components: string[];
  explanation: string;
}

export interface TechnicalDetail {
  detected: number;
  confirmed: { skill: string; evidence: string[] }[];
  probable: string[];
  not_found: string[];
}

export interface SearchGroup {
  type: string;
  label: string;
  items: { id: string; title: string; subtitle: string | null; snippet: string | null; href: string }[];
}

export interface AiStatus {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  local: boolean;
}

export interface Cited { point: string; quote: string }

export interface AiBrief {
  summary: string;
  priorities: Cited[];
  questions_to_ask: string[];
  watch_outs: Cited[];
  strengths: { skill: string; evidence: string[] }[];
  self_reported: string[];
  gaps: string[];
  constraints: string[];
  compatibility: number | null;
  removed_claims: number;
  model: string;
  created_at: string;
}

export interface PracticeQuestion { question: string; topic: string | null; reason: string; quote: string }
export interface AiPractice { questions: PracticeQuestion[]; weak_topics: string[] }

export interface AiFeedback {
  summary: string;
  strengths: string[];
  improvements: string[];
  star: { situation: boolean; task: boolean; action: boolean; result: boolean };
  suggested_evidence: { id: string; text: string }[];
  removed_claims: number;
}

export interface FactClaim { text: string; fact_ids: string[] }
export interface AiDebrief {
  headline: string;
  observations: FactClaim[];
  focus: FactClaim[];
  facts: Record<string, string>;
  removed_claims: number;
}

export interface AssistantReply {
  reply: string;
  tool_calls: { name: string; input: Record<string, unknown> }[];
  sources: { title: string; items: { label: string; detail: string; href: string }[] }[];
}
export interface AgentProposal {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  title: string;
  detail: string;
}

export interface AgentReply {
  reply: string;
  steps: string[];
  sources: AssistantReply["sources"];
  actions: AgentProposal[];
  mode: "agent" | "read_only";
}

// ---------- Profile ----------
export type SkillProficiency = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
export type LanguageProficiency = "BASIC" | "CONVERSATIONAL" | "FLUENT" | "NATIVE";
export type EvidenceType = "EXPERIENCE" | "PROJECT" | "EDUCATION" | "CERTIFICATION" | "OTHER";
export type EvidenceConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface Experience {
  id: string;
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  achievements: string | null;
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  gpa: number | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repository_url: string | null;
  demo_url: string | null;
}

export interface SkillEvidence {
  id: string;
  skill_id: string;
  evidence_type: EvidenceType;
  source_experience_id: string | null;
  source_project_id: string | null;
  source_education_id: string | null;
  description: string;
  confidence: EvidenceConfidence;
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  proficiency: SkillProficiency | null;
  years_experience: number | null;
  evidences: SkillEvidence[];
}

export interface Language {
  id: string;
  language: string;
  proficiency: LanguageProficiency;
}

export interface Preferences {
  remote_preference: WorkMode | null;
  desired_employment_type: EmploymentType | null;
  salary_expectation_min: number | null;
  salary_expectation_max: number | null;
  currency: string | null;
  locations: string[];
  desired_roles: string[];
}

export interface ProfileSummary {
  completeness: number;
  label: string;
  totals: { skills: number; evidenced_skills: number; experiences: number; projects: number };
  categories: { category: string; evidenced: number; skills: { name: string; evidence_count: number }[] }[];
  checklist: { key: string; label: string; done: boolean }[];
}

// ---------- CV import ----------
export interface CvExperience {
  title: string;
  company: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  current: boolean;
  achievements: string | null;
  exists: boolean;
}
export type CvEducation = Omit<Education, "id"> & { exists: boolean };
export type CvProject = Omit<Project, "id"> & { exists: boolean };
export interface CvSkill { name: string; category: string | null; exists: boolean }
export interface CvLanguage { language: string; proficiency: LanguageProficiency; exists: boolean }

export interface CvParseResult {
  method: "ai" | "rules";
  notice: string | null;
  pages: number;
  removed: number;
  resume: Resume | null;
  full_name: string;
  headline: string;
  experiences: CvExperience[];
  education: CvEducation[];
  projects: CvProject[];
  skills: CvSkill[];
  languages: CvLanguage[];
}

export interface CvImportCounts {
  experiences: number; education: number; projects: number; skills: number; languages: number; evidence: number;
}

export interface CvCheck {
  status: "ok" | "no_posting" | "no_resume";
  resume: { id: string; name: string; version: string | null; attached: boolean } | null;
  required: { skill: string; in_cv: boolean }[];
  preferred: { skill: string; in_cv: boolean }[];
  coverage: number | null;
}

export interface JobImport {
  job: ParsedJob;
  method: "ai" | "rules";
  notice: string | null;
  text: string;
  url: string;
  source: string;
}

// ---------- Analytics ----------
export interface Stats {
  total: number;
  by_status: Partial<Record<Status, number>>;
  conversion_rate_interview: number;
  conversion_rate_offer: number;
  avg_salary_min: number | null;
  avg_salary_max: number | null;
  applications_per_month: Record<string, number>;
}

export interface FunnelStep { from_label: string; to_label: string; from_count: number; to_count: number; rate: number | null }
export interface Breakdown { label: string; applications: number; responses: number; response_rate: number | null; limited_data: boolean }
export interface Timing { n: number; median_days: number | null; average_days: number | null; limited_data: boolean }

export interface AnalyticsOverview {
  total_applications: number;
  funnel: {
    stages: { key: string; label: string; count: number }[];
    steps: FunnelStep[];
    bottleneck: (FunnelStep & { message: string }) | null;
    rejected_count: number;
    withdrawn_count: number;
    limited_data: boolean;
    min_sample: number;
    definitions: Record<string, string>;
  };
  rejections: { total_rejected: number; items: { reason: string; count: number; percent: number }[]; limited_data: boolean; min_sample: number };
  breakdowns: Record<"source" | "location" | "work_mode", Breakdown[]>;
  timing: { first_response: Timing; to_rejection: Timing; time_in_stage: (Timing & { status: Status })[] };
}

export interface ResumeComparison {
  resumes: { resume_id: string | null; name: string; applications: number; responses: number; interviews: number;
             response_rate: number | null; interview_rate: number | null; limited_data: boolean }[];
  comparison: string;
  label: string;
  min_sample: number;
}

export interface Share { label: string; count: number; percent: number }
export interface MarketSkill { skill: string; category: string | null; count: number; percent: number; in_profile: boolean }

export interface MarketInsights {
  total_postings: number;
  postings_with_description: number;
  limited_data: boolean;
  min_sample: number;
  skills: MarketSkill[];
  skill_gaps: MarketSkill[];
  locations: Share[];
  work_modes: Share[];
  seniority: Share[];
  employment_types: Share[];
  roles: Share[];
  salary: { currency: string; postings: number; median_midpoint: number; min: number; max: number }[];
  label: string;
}

export interface TopicStat {
  topic: string;
  question_count: number;
  rated_count: number;
  average_confidence: number | null;
  first_half_average: number | null;
  recent_average: number | null;
  trend: "improving" | "declining" | "stable" | null;
  limited_data: boolean;
}

export interface WeaknessMap {
  total_questions: number;
  topics: TopicStat[];
  most_frequent: { topic: string; question_count: number }[];
  label: string;
  min_observations: number;
}

export interface DashboardSummary {
  user_name: string;
  kpis: { active_applications: number; upcoming_interviews: number; follow_ups_due: number;
          applied_this_week: number; response_rate: number | null; submitted: number; applied_previous_week: number };
  trend: { week_start: string; applied: number; responses: number; saved: number }[];
  pipeline: { status: Status; count: number }[];
  upcoming_interviews: { id: string; scheduled_at: string; interview_type: string | null;
                         location_or_link: string | null; application: ApplicationRef | null }[];
  follow_ups: { kind: "task" | "contact"; id: string; title: string; due_date: string }[];
  deadlines: (ApplicationRef & { deadline: string })[];
  waiting_for_response: ApplicationRef[];
  recent_activity: { id: string; event_type: EventType; from_status: Status | null; to_status: Status | null;
                     description: string | null; occurred_at: string; application: ApplicationRef | null }[];
  insights: { top_skill: string | null; top_skill_count: number; top_location: string | null; postings_analyzed: number };
  has_profile: boolean;
}
