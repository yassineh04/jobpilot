import type {
  EmploymentType, EventType, RejectionReason, RelationshipType, Seniority, Status, TaskKind, WorkMode,
} from "./types";

export const STATUSES: Status[] = [
  "SAVED", "PREPARING", "APPLIED", "RECRUITER_CONTACT", "ASSESSMENT",
  "INTERVIEW", "FINAL_INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN",
];

/** `dot` is used for small status markers; `tone` for badges. Kept muted on purpose. */
export const STATUS_META: Record<Status, { label: string; dot: string; tone: string; group: string }> = {
  SAVED: { label: "Saved", dot: "bg-stone-400", tone: "bg-stone-100 text-stone-700", group: "Not submitted" },
  PREPARING: { label: "Preparing", dot: "bg-stone-500", tone: "bg-stone-100 text-stone-700", group: "Not submitted" },
  APPLIED: { label: "Applied", dot: "bg-sky-500", tone: "bg-sky-50 text-sky-800", group: "In progress" },
  RECRUITER_CONTACT: { label: "Recruiter contact", dot: "bg-indigo-500", tone: "bg-indigo-50 text-indigo-800", group: "In progress" },
  ASSESSMENT: { label: "Assessment", dot: "bg-violet-500", tone: "bg-violet-50 text-violet-800", group: "In progress" },
  INTERVIEW: { label: "Interview", dot: "bg-amber-500", tone: "bg-amber-50 text-amber-800", group: "In progress" },
  FINAL_INTERVIEW: { label: "Final interview", dot: "bg-orange-500", tone: "bg-orange-50 text-orange-800", group: "In progress" },
  OFFER: { label: "Offer", dot: "bg-accent-500", tone: "bg-accent-50 text-accent-800", group: "Closed" },
  REJECTED: { label: "Rejected", dot: "bg-rose-500", tone: "bg-rose-50 text-rose-800", group: "Closed" },
  WITHDRAWN: { label: "Withdrawn", dot: "bg-stone-300", tone: "bg-stone-100 text-stone-600", group: "Closed" },
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  REMOTE: "Remote", HYBRID: "Hybrid", ON_SITE: "On-site",
};

/** "Montreal, QC · Hybrid". The work mode is left out when the location already says it ("Remote"). */
export function placeLabel(location?: string | null, workMode?: WorkMode | null) {
  const mode = workMode ? WORK_MODE_LABELS[workMode] : null;
  const repeats = !!location && !!mode && location.toLowerCase().includes(mode.toLowerCase());
  return [location, repeats ? null : mode].filter(Boolean).join(" · ");
}

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  INTERNSHIP: "Internship", FREELANCE: "Freelance",
};

export const SENIORITY_LABELS: Record<Seniority, string> = {
  INTERN: "Intern", JUNIOR: "Junior", MID: "Mid-level", SENIOR: "Senior",
  LEAD: "Lead", STAFF: "Staff", PRINCIPAL: "Principal",
};

export const REJECTION_LABELS: Record<RejectionReason | "NOT_RECORDED", string> = {
  EXPERIENCE: "Experience", SKILLS: "Skills", LOCATION: "Location",
  COMPENSATION: "Compensation", WORK_AUTHORIZATION: "Work authorization",
  ASSESSMENT: "Assessment", INTERVIEW: "Interview", RESUME: "Resume",
  UNKNOWN: "Unknown", OTHER: "Other", NOT_RECORDED: "Not recorded",
};

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  RECRUITER: "Recruiter", HIRING_MANAGER: "Hiring manager", REFERRAL: "Referral",
  PEER: "Peer", MENTOR: "Mentor", ALUMNI: "Alumni", OTHER: "Other",
};

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  FOLLOW_UP: "Follow-up", DEADLINE: "Deadline", PREPARATION: "Preparation",
  NETWORKING: "Networking", OTHER: "Task",
};

export const EVENT_LABELS: Record<EventType, string> = {
  CREATED: "Saved", STATUS_CHANGED: "Status changed",
  INTERVIEW_SCHEDULED: "Interview scheduled", CONTACT_LINKED: "Contact linked",
};

export const INTERVIEW_TYPES = [
  "Recruiter screen", "Behavioral", "Technical", "Coding",
  "System design", "Hiring manager", "Final", "Other",
];

export const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "CHF"];

export function enumOptions<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
