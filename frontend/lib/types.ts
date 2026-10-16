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