import type {
  AiBrief, AiDebrief, AiFeedback, AiPractice, AiStatus, AppEvent, Application, AssistantReply, Contact,
  Interview, MatchResult, ParsedJob, Question, Resume, SearchGroup, Task, Topic, User,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8300";
const TOKEN_KEY = "token";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function errorMessage(res: Response) {
  const err = await res.json().catch(() => ({}));
  // FastAPI validation errors (422) return a list of {loc, msg} objects
  if (Array.isArray(err.detail)) {
    return err.detail.map((d: { msg?: string }) => d.msg?.replace(/^Value error, /, "")).filter(Boolean).join(", ")
      || "Some fields are invalid.";
  }
  if (typeof err.detail === "string") return err.detail;
  if (res.status >= 500) return "The server ran into a problem. Please try again.";
  return "Request failed.";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and that the API is running.", 0);
  }
  if (res.status === 401 && token) {
    // Session expired or token invalid: start over from the login page
    setToken(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      // Outside React (no router here); a full reload also drops any state from the old session
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`;
    }
  }
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  if (res.status === 204) return null as T;
  return res.json();
}

const json = (method: string, body?: unknown): RequestInit => ({
  method, body: body === undefined ? undefined : JSON.stringify(body),
});
const qs = (params: Record<string, string | undefined> = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
  const s = new URLSearchParams(clean as Record<string, string>).toString();
  return s ? `?${s}` : "";
};

// Loose payload type for create/update bodies; responses are typed.
type Body = Record<string, unknown>;

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<{ access_token: string }> => {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: email, password }),
      });
    } catch {
      throw new ApiError("Can't reach the server. Check your connection and that the API is running.", 0);
    }
    if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
    return res.json();
  },
  register: (email: string, password: string, full_name?: string) =>
    request<User>("/auth/register", json("POST", { email, password, full_name })),
  me: () => request<User>("/auth/me"),
  updateMe: (data: Body) => request<User>("/auth/me", json("PATCH", data)),
  changePassword: (current_password: string, new_password: string) =>
    request<{ access_token: string }>("/auth/change-password", json("POST", { current_password, new_password })),

  // Dashboard / search / insights
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dashboard: () => request<any>("/dashboard/summary"),
  search: (q: string) => request<{ query: string; total: number; groups: SearchGroup[] }>(`/search/${qs({ q })}`),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marketInsights: () => request<any>("/insights/market"),

  // Applications
  listApplications: (params: Record<string, string | undefined> = {}) =>
    request<Application[]>(`/applications/${qs(params)}`),
  getApplication: (id: string) => request<Application>(`/applications/${id}`),
  createApplication: (data: Body) => request<Application>("/applications/", json("POST", data)),
  updateApplication: (id: string, data: Body) => request<Application>(`/applications/${id}`, json("PATCH", data)),
  deleteApplication: (id: string) => request<null>(`/applications/${id}`, json("DELETE")),
  applicationEvents: (id: string) => request<AppEvent[]>(`/applications/${id}/events`),
  applicationContacts: (id: string) => request<Contact[]>(`/applications/${id}/contacts`),
  addInterview: (appId: string, data: Body) =>
    request<Interview>(`/applications/${appId}/interviews`, json("POST", data)),
  getApplicationMatch: (id: string) => request<MatchResult>(`/applications/${id}/match`),
  parseJob: (text: string) =>
    request<{ job: ParsedJob; method: "ai" | "rules"; notice: string | null }>("/jobs/parse", json("POST", { text })),
  listCompanies: () => request<{ id: string; name: string }[]>("/companies/"),

  // Interviews
  listInterviews: (params: Record<string, string> = {}) => request<Interview[]>(`/calendar/interviews${qs(params)}`),
  updateInterview: (id: string, data: Body) => request<Interview>(`/interviews/${id}`, json("PATCH", data)),
  deleteInterview: (id: string) => request<null>(`/interviews/${id}`, json("DELETE")),

  // Contacts
  listContacts: (params: Record<string, string | undefined> = {}) => request<Contact[]>(`/contacts/${qs(params)}`),
  createContact: (data: Body) => request<Contact>("/contacts/", json("POST", data)),
  updateContact: (id: string, data: Body) => request<Contact>(`/contacts/${id}`, json("PUT", data)),
  logInteraction: (id: string) => request<Contact>(`/contacts/${id}/interactions`, json("POST")),
  deleteContact: (id: string) => request<null>(`/contacts/${id}`, json("DELETE")),

  // Tasks
  listTasks: (status: "open" | "done" | "all" = "open") => request<Task[]>(`/tasks/${qs({ status })}`),
  createTask: (data: Body) => request<Task>("/tasks/", json("POST", data)),
  updateTask: (id: string, data: Body) => request<Task>(`/tasks/${id}`, json("PATCH", data)),
  deleteTask: (id: string) => request<null>(`/tasks/${id}`, json("DELETE")),

  // Stats & analytics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getStats: () => request<any>("/stats/"),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAnalyticsOverview: () => request<any>("/analytics/overview"),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getResumeComparison: () => request<any>("/analytics/resumes"),

  // Profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileSummary: () => request<any>("/profile/summary"),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listEducation: () => request<any[]>("/profile/education"),
  createEducation: (data: Body) => request("/profile/education", json("POST", data)),
  updateEducation: (id: string, data: Body) => request(`/profile/education/${id}`, json("PATCH", data)),
  deleteEducation: (id: string) => request(`/profile/education/${id}`, json("DELETE")),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listExperiences: () => request<any[]>("/profile/experiences"),
  createExperience: (data: Body) => request("/profile/experiences", json("POST", data)),
  updateExperience: (id: string, data: Body) => request(`/profile/experiences/${id}`, json("PATCH", data)),
  deleteExperience: (id: string) => request(`/profile/experiences/${id}`, json("DELETE")),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listProjects: () => request<any[]>("/profile/projects"),
  createProject: (data: Body) => request("/profile/projects", json("POST", data)),
  updateProject: (id: string, data: Body) => request(`/profile/projects/${id}`, json("PATCH", data)),
  deleteProject: (id: string) => request(`/profile/projects/${id}`, json("DELETE")),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listSkills: () => request<any[]>("/profile/skills"),
  createSkill: (data: Body) => request("/profile/skills", json("POST", data)),
  updateSkill: (id: string, data: Body) => request(`/profile/skills/${id}`, json("PATCH", data)),
  deleteSkill: (id: string) => request(`/profile/skills/${id}`, json("DELETE")),
  addSkillEvidence: (skillId: string, data: Body) =>
    request(`/profile/skills/${skillId}/evidence`, json("POST", data)),
  deleteSkillEvidence: (skillId: string, evidenceId: string) =>
    request(`/profile/skills/${skillId}/evidence/${evidenceId}`, json("DELETE")),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listLanguages: () => request<any[]>("/profile/languages"),
  createLanguage: (data: Body) => request("/profile/languages", json("POST", data)),
  deleteLanguage: (id: string) => request(`/profile/languages/${id}`, json("DELETE")),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPreferences: () => request<any>("/profile/preferences"),
  updatePreferences: (data: Body) => request("/profile/preferences", json("PUT", data)),

  // Interview question bank
  listQuestionTopics: () => request<Topic[]>("/interview-questions/topics"),
  createQuestionTopic: (name: string) => request<Topic>("/interview-questions/topics", json("POST", { name })),
  deleteQuestionTopic: (id: string) => request<null>(`/interview-questions/topics/${id}`, json("DELETE")),
  listQuestions: (params: Record<string, string | undefined> = {}) =>
    request<Question[]>(`/interview-questions/${qs(params)}`),
  createQuestion: (data: Body) => request<Question>("/interview-questions/", json("POST", data)),
  updateQuestion: (id: string, data: Body) => request<Question>(`/interview-questions/${id}`, json("PATCH", data)),
  deleteQuestion: (id: string) => request<null>(`/interview-questions/${id}`, json("DELETE")),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getWeaknessMap: () => request<any>("/interview-questions/weakness-map"),

  // Resumes
  listResumes: () => request<Resume[]>("/resumes/"),
  createResume: (data: Body) => request<Resume>("/resumes/", json("POST", data)),
  updateResume: (id: string, data: Body) => request<Resume>(`/resumes/${id}`, json("PATCH", data)),
  deleteResume: (id: string) => request<null>(`/resumes/${id}`, json("DELETE")),

  // AI (free providers; every claim is verified server-side)
  aiStatus: () => request<AiStatus>("/ai/status"),
  getBrief: (appId: string) => request<AiBrief>(`/ai/applications/${appId}/brief`),
  generateBrief: (appId: string) => request<AiBrief>(`/ai/applications/${appId}/brief`, json("POST")),
  practiceQuestions: (appId: string) => request<AiPractice>(`/ai/applications/${appId}/practice`, json("POST")),
  answerFeedback: (question: string, answer: string, application_id?: string | null) =>
    request<AiFeedback>("/ai/feedback", json("POST", { question, answer, application_id: application_id || null })),
  draftMessage: (appId: string, kind: "thank_you" | "follow_up" | "networking", contact_id?: string | null, notes = "") =>
    request<{ subject: string; body: string }>(`/ai/applications/${appId}/draft`,
      json("POST", { kind, contact_id: contact_id || null, notes })),
  debrief: () => request<AiDebrief>("/ai/debrief", json("POST")),
  assistantChat: (messages: { role: "user" | "assistant"; content: string }[]) =>
    request<AssistantReply>("/assistant/chat", json("POST", { messages })),
};