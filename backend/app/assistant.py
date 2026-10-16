"""AI job-search assistant: answers questions about the user's own data.

Security model: tools are plain Python functions bound to the authenticated user's id on the
server. The code decides which read-only lookups to run (validated arguments, no SQL from the\nmodel); the model only writes the answer from those results and never sees another user's data.
"""
import json
import re
import logging
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Callable, Literal, Optional
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload
from app import models
from app.ai import require_llm
from app.analytics import RESPONSE_STATUSES
from app.skills_catalog import detect_skills, mentioned_in

logger = logging.getLogger(__name__)
MAX_TOOL_ROUNDS = 2
MAX_ROWS = 25

SYSTEM_PROMPT = """You are the JobPilot assistant. You help one user explore their own job-search data
(applications, saved job postings, resumes, interviews, interview questions, contacts and tasks).

Rules:
- Answer only from the results of your tools. If the tools return nothing relevant, say that the data
  is not recorded; never invent applications, companies, skills, dates or evidence.
- Never predict hiring outcomes or chances of getting a job. You may describe observed patterns.
- Statuses: SAVED and PREPARING mean not yet submitted. "Waiting for an answer" means APPLIED.
- Be concise. Use short lists. Refer to applications as "Role at Company".
- Today's date is provided in each user message context."""


# ---------- Tool input schemas (validated before execution) ----------
Status = Literal["SAVED", "PREPARING", "APPLIED", "RECRUITER_CONTACT", "ASSESSMENT",
                 "INTERVIEW", "FINAL_INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"]


STATUS_SYNONYMS = {"WAITING": "APPLIED", "PENDING": "APPLIED", "SUBMITTED": "APPLIED",
                   "RECRUITER": "RECRUITER_CONTACT", "SCREEN": "RECRUITER_CONTACT", "FINAL": "FINAL_INTERVIEW",
                   "REJECT": "REJECTED", "DECLINED": "REJECTED", "OFFERED": "OFFER", "SAVE": "SAVED"}


class SearchApplicationsInput(BaseModel):
    statuses: list[Status] = Field(default_factory=list, description=(
        "any of SAVED, PREPARING, APPLIED (= waiting for an answer), RECRUITER_CONTACT, ASSESSMENT, "
        "INTERVIEW, FINAL_INTERVIEW, OFFER, REJECTED, WITHDRAWN"))
    text: Optional[str] = Field(None, max_length=100, description="Matches role, company, location or notes")
    required_skills: list[str] = Field(default_factory=list, max_length=10,
                                       description="Postings must mention ALL of these skills")
    any_skills: list[str] = Field(default_factory=list, max_length=10,
                                  description="Postings must mention AT LEAST ONE of these skills")
    created_within_days: Optional[int] = Field(None, ge=1, le=3650)
    applied_within_days: Optional[int] = Field(None, ge=1, le=3650)
    limit: int = Field(15, ge=1, le=MAX_ROWS)

    @field_validator("statuses", mode="before")
    @classmethod
    def _statuses(cls, value):
        """Maps loose wording ("waiting", "rejected") to real statuses and drops unknown ones."""
        values = value.replace(";", ",").split(",") if isinstance(value, str) else (value or [])
        allowed = set(Status.__args__)
        result = []
        for v in values:
            key = str(v).strip().upper().replace(" ", "_")
            key = key if key in allowed else next(
                (s for prefix, s in STATUS_SYNONYMS.items() if key.startswith(prefix)), None)
            if key and key not in result:
                result.append(key)
        return result

    @field_validator("text", mode="before")
    @classmethod
    def _text(cls, value):
        return " ".join(map(str, value)) if isinstance(value, list) else value

    @field_validator("required_skills", "any_skills", mode="before")
    @classmethod
    def _skills(cls, value):
        return [value] if isinstance(value, str) else value


class ApplicationIdInput(BaseModel):
    application_id: uuid.UUID


class EmptyInput(BaseModel):
    pass


class UpcomingInput(BaseModel):
    days: int = Field(14, ge=1, le=365)


class FollowUpInput(BaseModel):
    include_without_follow_up_date: bool = Field(
        False, description="Also list contacts never contacted or with no follow-up planned")


# ---------- Tool implementations ----------
def _app_summary(a: models.Application) -> dict:
    return {
        "id": str(a.id), "role": a.position_title, "company": a.company_name, "status": a.status.value,
        "location": a.location, "work_mode": a.work_mode.value if a.work_mode else None,
        "applied_date": a.applied_date.date().isoformat() if a.applied_date else None,
        "saved_date": a.date_saved.date().isoformat() if a.date_saved else None,
        "salary": [a.salary_min, a.salary_max, a.currency] if (a.salary_min or a.salary_max) else None,
        "tags": a.tag_list,
    }


def search_applications(db: Session, user_id, args: SearchApplicationsInput) -> dict:
    q = (db.query(models.Application).join(models.Company)
         .options(selectinload(models.Application.company), selectinload(models.Application.tags))
         .filter(models.Application.owner_id == user_id))
    if args.statuses:
        q = q.filter(models.Application.status.in_(args.statuses))
    if args.text:
        like = f"%{args.text}%"
        q = q.filter(or_(models.Application.position_title.ilike(like), models.Company.name.ilike(like),
                         models.Application.location.ilike(like), models.Application.notes.ilike(like)))
    now = datetime.utcnow()
    if args.created_within_days:
        q = q.filter(models.Application.created_at >= now - timedelta(days=args.created_within_days))
    if args.applied_within_days:
        q = q.filter(models.Application.applied_date >= now - timedelta(days=args.applied_within_days))
    apps = q.order_by(models.Application.created_at.desc()).all()

    if args.required_skills or args.any_skills:
        def matches(a):
            text = f"{a.job_description or ''} {a.position_title}"
            ok_all = all(mentioned_in(s, text) for s in args.required_skills)
            ok_any = not args.any_skills or any(mentioned_in(s, text) for s in args.any_skills)
            return ok_all and ok_any
        apps = [a for a in apps if matches(a)]

    return {"total_matches": len(apps), "applications": [_app_summary(a) for a in apps[:args.limit]],
            "note": "Skill filters only search job descriptions the user saved."}


def get_application_details(db: Session, user_id, args: ApplicationIdInput) -> dict:
    a = db.query(models.Application).filter(models.Application.id == args.application_id,
                                            models.Application.owner_id == user_id).first()
    if not a:
        return {"error": "Application not found"}
    return {
        **_app_summary(a),
        "job_description": (a.job_description or "")[:3000] or None,
        "notes": a.notes, "rejection_reason": a.rejection_reason.value if a.rejection_reason else None,
        "deadline": a.deadline.isoformat() if a.deadline else None,
        "interviews": [{"date": i.scheduled_at.isoformat(), "type": i.interview_type,
                        "outcome": i.outcome} for i in a.interviews],
        "contacts": [c.name for c in a.contacts],
        "history": [{"date": e.occurred_at.date().isoformat(), "event": e.event_type.value,
                     "to_status": e.to_status.value if e.to_status else None} for e in a.events],
    }


def pipeline_overview(db: Session, user_id, _args: EmptyInput) -> dict:
    apps = db.query(models.Application).filter(models.Application.owner_id == user_id).all()
    counts = Counter(a.status.value for a in apps)
    submitted = [a for a in apps if a.status.value not in ("SAVED", "PREPARING")]
    responded = [a for a in submitted if a.status.value in RESPONSE_STATUSES]
    return {"total": len(apps), "by_status": dict(counts), "submitted": len(submitted),
            "with_response": len(responded),
            "observed_response_rate_percent": round(len(responded) / len(submitted) * 100, 1)
            if submitted else None}


def resume_usage(db: Session, user_id, _args: EmptyInput) -> dict:
    rows = (db.query(models.Resume.name, models.Resume.version, func.count(models.Application.id))
            .outerjoin(models.Application, models.Application.resume_id == models.Resume.id)
            .filter(models.Resume.owner_id == user_id)
            .group_by(models.Resume.id).all())
    without = db.query(func.count(models.Application.id)).filter(
        models.Application.owner_id == user_id, models.Application.resume_id.is_(None)).scalar()
    return {"resumes": [{"name": n, "version": v, "applications": c}
                        for n, v, c in sorted(rows, key=lambda r: -r[2])],
            "applications_without_resume": without}


def interview_topics(db: Session, user_id, _args: EmptyInput) -> dict:
    rows = (db.query(models.QuestionTopic.name, func.count(models.InterviewQuestion.id),
                     func.avg(models.InterviewQuestion.confidence))
            .join(models.InterviewQuestion, models.InterviewQuestion.topic_id == models.QuestionTopic.id)
            .filter(models.InterviewQuestion.owner_id == user_id)
            .group_by(models.QuestionTopic.name).all())
    return {"topics": [{"topic": t, "questions": c,
                        "avg_self_reported_confidence": round(float(avg), 2) if avg is not None else None}
                       for t, c, avg in sorted(rows, key=lambda r: -r[1])],
            "label": "Confidence is self-reported, not an objective measure."}


def upcoming_interviews(db: Session, user_id, args: UpcomingInput) -> dict:
    now = datetime.utcnow()
    rows = (db.query(models.Interview).join(models.Application)
            .filter(models.Application.owner_id == user_id,
                    models.Interview.scheduled_at >= now,
                    models.Interview.scheduled_at <= now + timedelta(days=args.days))
            .order_by(models.Interview.scheduled_at).all())
    return {"interviews": [{"date": i.scheduled_at.isoformat(), "type": i.interview_type,
                            "role": i.application.position_title, "company": i.application.company_name,
                            "location_or_link": i.location_or_link} for i in rows]}


def contacts_follow_up(db: Session, user_id, args: FollowUpInput) -> dict:
    contacts = (db.query(models.Contact).filter(models.Contact.owner_id == user_id)
                .order_by(models.Contact.next_follow_up_at.asc().nulls_last()).all())
    today = date.today()
    due = [c for c in contacts if c.next_follow_up_at and c.next_follow_up_at <= today]
    upcoming = [c for c in contacts if c.next_follow_up_at and c.next_follow_up_at > today]
    result = {
        "due_or_overdue": [{"name": c.name, "company": c.company_name, "due": c.next_follow_up_at.isoformat(),
                            "last_interaction": c.last_interaction_at.isoformat() if c.last_interaction_at else None}
                           for c in due],
        "upcoming": [{"name": c.name, "company": c.company_name, "due": c.next_follow_up_at.isoformat()}
                     for c in upcoming[:10]],
    }
    if args.include_without_follow_up_date:
        result["no_follow_up_planned"] = [
            {"name": c.name, "company": c.company_name,
             "last_interaction": c.last_interaction_at.isoformat() if c.last_interaction_at else None}
            for c in contacts if not c.next_follow_up_at][:MAX_ROWS]
    return result


def open_tasks(db: Session, user_id, _args: EmptyInput) -> dict:
    tasks = (db.query(models.Task).filter(models.Task.owner_id == user_id,
                                          models.Task.completed_at.is_(None))
             .order_by(models.Task.due_date.asc().nulls_last()).limit(MAX_ROWS).all())
    return {"tasks": [{"title": t.title, "kind": t.kind.value,
                       "due": t.due_date.isoformat() if t.due_date else None} for t in tasks]}


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_model: type[BaseModel]
    handler: Callable[..., dict]


TOOLS: list[Tool] = [
    Tool(name="search_applications", input_model=SearchApplicationsInput, handler=search_applications,
         description="Search the user's applications and saved job postings by status, text, skills "
                     "mentioned in the job description, and recency. Use for questions like "
                     "'which jobs require AWS' or 'applications from the last 30 days'."),
    Tool(name="get_application_details", input_model=ApplicationIdInput, handler=get_application_details,
         description="Full details for one application (description, notes, interviews, history). "
                     "Use an id returned by search_applications."),
    Tool(name="pipeline_overview", input_model=EmptyInput, handler=pipeline_overview,
         description="Counts of applications per status and the observed response rate."),
    Tool(name="resume_usage", input_model=EmptyInput, handler=resume_usage,
         description="How many applications used each resume."),
    Tool(name="interview_topics", input_model=EmptyInput, handler=interview_topics,
         description="Interview question topics the user recorded, with counts and self-reported confidence."),
    Tool(name="upcoming_interviews", input_model=UpcomingInput, handler=upcoming_interviews,
         description="Interviews scheduled in the next N days."),
    Tool(name="contacts_follow_up", input_model=FollowUpInput, handler=contacts_follow_up,
         description="Networking contacts with follow-ups due, upcoming, or not planned."),
    Tool(name="open_tasks", input_model=EmptyInput, handler=open_tasks,
         description="The user's open tasks and their due dates."),
]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}




def execute_tool(db: Session, user_id, name: str, raw_input: Any) -> tuple[str, bool]:
    """Returns (json result, is_error). Unknown tools and invalid arguments become tool errors."""
    tool = TOOLS_BY_NAME.get(name)
    if tool is None:
        return json.dumps({"error": f"Unknown tool {name}"}), True
    try:
        args = tool.input_model.model_validate(raw_input or {})
    except ValidationError as exc:
        return json.dumps({"error": "Invalid arguments", "details": exc.errors(include_url=False)},
                          default=str), True
    try:
        return json.dumps(tool.handler(db, user_id, args), default=str), False
    except Exception:
        logger.exception("Assistant tool %s failed", name)
        return json.dumps({"error": "The tool failed. Tell the user the data could not be loaded."}), True


ANSWER_RULES = """Answer the user's question using ONLY the data below (it was looked up for you).
The full matching records are displayed to the user right below your answer, so do NOT list them all:
answer in 1 to 3 sentences: give the exact count from the data and name at most 3 items.
Read the numbers carefully. If the data does not contain the answer, say it is not recorded.
Refer to applications as "Role at Company". Answer in {language}."""

FRENCH_HINTS = {"quelles", "quels", "quel", "quelle", "mes", "est", "les", "des", "offres", "candidatures",
                "entrevue", "entrevues", "combien", "qui", "dois", "je", "pour", "avec", "une", "relancer"}

STATUS_WORDS = [  # (keywords, statuses) - deterministic interpretation of the question
    (("waiting", "hear back", "no answer", "pending", "attente", "réponse", "reponse", "sans nouvelles"), ["APPLIED"]),
    (("rejected", "rejection", "refus", "rejet"), ["REJECTED"]),
    (("interview", "entrevue", "entretien"), ["INTERVIEW", "FINAL_INTERVIEW"]),
    (("offer", "received an offer", "proposition"), ["OFFER"]),
    (("saved", "not applied", "sauvegard", "pas encore postul"), ["SAVED", "PREPARING"]),
    (("recruiter", "recruteur"), ["RECRUITER_CONTACT"]),
]
DAYS = re.compile(r"(?:last|past|derni[eè]rs?)\s+(\d{1,3})\s+(?:days?|jours?)", re.IGNORECASE)


def detect_language(text: str) -> str:
    words = set(re.findall(r"[a-zàâçéèêëîïôûùüÿœ]+", text.lower()))
    return "French" if len(words & FRENCH_HINTS) >= 2 or re.search(r"[éèàçù]", text) else \
        "the same language as the question"


def application_filters(db: Session, user_id, question: str) -> dict:
    """Turns the question into search filters without asking the model (reliable on any model)."""
    q = question.lower()
    args: dict = {"limit": MAX_ROWS}
    skills = detect_skills(question)
    if skills:
        args["any_skills" if re.search(r"\b(or|ou)\b", q) else "required_skills"] = skills[:5]
    statuses: list[str] = []
    for words, values in STATUS_WORDS:
        # "offre" in French means a job posting, not an offer: only map the English word
        if any(w in q for w in words) and not (values == ["OFFER"] and "offres" in q):
            statuses += [s for s in values if s not in statuses]
    if statuses:
        args["statuses"] = statuses
    if match := DAYS.search(question):
        args["created_within_days"] = max(1, min(3650, int(match.group(1))))
    companies = [c.name for c in db.query(models.Company).filter(models.Company.owner_id == user_id)]
    named = [c for c in companies if re.search(rf"\b{re.escape(c.lower())}\b", q)]
    if named:
        args["text"] = named[0]
    return args


SECTIONS = [  # (keywords, tool, args) - which lookups a question needs
    (("follow", "relanc", "contact", "network", "réseau", "reseau", "recruiter", "recruteur"),
     "contacts_follow_up", {"include_without_follow_up_date": True}),
    (("resume", "cv", "curriculum"), "resume_usage", {}),
    (("topic", "question", "sujet", "weak", "faibl", "prepar", "confidence", "confiance"), "interview_topics", {}),
    (("upcoming", "next", "schedul", "à venir", "a venir", "prochain", "calendar", "calendrier", "this week"),
     "upcoming_interviews", {"days": 30}),
    (("task", "tâche", "tache", "todo", "to do", "à faire", "a faire"), "open_tasks", {}),
]


def _lines(name: str, data: dict) -> str:
    """Compact, readable text for the model (small models do much better than with raw JSON)."""
    if name == "search_applications":
        rows = [f"- {a['role']} at {a['company']} | {a['status'].replace('_', ' ').lower()}"
                + (f" | applied {a['applied_date']}" if a.get("applied_date") else f" | saved {a.get('saved_date')}")
                + (f" | {a['location']}" if a.get("location") else "") for a in data["applications"]]
        n = data["total_matches"]
        head = f"EXACT COUNT: {n} application{'s' if n != 1 else ''} match the question" + (
            f" (showing {len(rows)})" if len(rows) < n else "")
        return f"{head}:\n" + ("\n".join(rows) or "- none")
    if name == "pipeline_overview":
        counts = ", ".join(f"{k.replace('_', ' ').lower()}: {v}" for k, v in data["by_status"].items())
        return (f"Pipeline: {data['total']} applications ({counts}). Observed response rate: "
                f"{data['observed_response_rate_percent']}%.")
    if name == "contacts_follow_up":
        due = "\n".join(f"- {c['name']} ({c.get('company') or 'no company'}) due {c['due']}" for c in data["due_or_overdue"])
        soon = "\n".join(f"- {c['name']} ({c.get('company') or 'no company'}) on {c['due']}" for c in data["upcoming"])
        none = "\n".join(f"- {c['name']} ({c.get('company') or 'no company'})" for c in data.get("no_follow_up_planned", []))
        return (f"Follow-ups due now or overdue:\n{due or '- none'}\nUpcoming follow-ups:\n{soon or '- none'}\n"
                f"Contacts without a planned follow-up:\n{none or '- none'}")
    if name == "resume_usage":
        rows = "\n".join(f"- {r['name']}{' ' + r['version'] if r['version'] else ''}: {r['applications']} applications"
                         for r in data["resumes"])
        return f"Resume usage:\n{rows or '- no resumes'}\n- no resume attached: {data['applications_without_resume']}"
    if name == "interview_topics":
        rows = "\n".join(f"- {t['topic']}: {t['questions']} questions, average self-reported confidence "
                         f"{t['avg_self_reported_confidence']}/5" for t in data["topics"])
        return f"Interview question topics (most frequent first):\n{rows or '- none recorded'}"
    if name == "upcoming_interviews":
        rows = "\n".join(f"- {i['date'][:16].replace('T', ' ')}: {i['type'] or 'interview'} for {i['role']} at {i['company']}"
                         for i in data["interviews"])
        return f"Upcoming interviews (next 30 days):\n{rows or '- none'}"
    if name == "open_tasks":
        rows = "\n".join(f"- {t['title']} (due {t['due'] or 'no date'})" for t in data["tasks"])
        return f"Open tasks:\n{rows or '- none'}"
    return json.dumps(data, default=str)[:3000]


def gather_context(db: Session, user_id, question: str) -> tuple[list[dict], list[str], list[dict]]:
    """Runs only the read-only lookups the question needs. Returns (calls, readable results)."""
    q = question.lower()
    specific = [(tool, args) for words, tool, args in SECTIONS if any(w in q for w in words)]
    filters = application_filters(db, user_id, question)
    plan = [] if specific else [("pipeline_overview", {})]
    if not specific or len(filters) > 1:  # general question, or one that filters applications
        plan.append(("search_applications", filters))
    plan += specific  # the most relevant data goes last, right before the question
    calls, results, sources = [], [], []
    for name, args in plan:
        output, is_error = execute_tool(db, user_id, name, args)
        if not is_error:
            data = json.loads(output)
            calls.append({"name": name, "input": args})
            results.append(_lines(name, data))
            # An empty application search is still shown: "0 matching records" is an answer too
            if (source := _source(name, data)) and (source["items"] or name == "search_applications"):
                sources.append(source)
    return calls, results, sources


def _source(name: str, data: dict) -> Optional[dict]:
    """The exact records behind an answer, shown under it so nothing depends on the model's recall."""
    if name == "search_applications":
        return {"title": f"Applications ({data['total_matches']})", "items": [
            {"label": f"{a['role']} at {a['company']}", "detail": a["status"].replace("_", " ").lower(),
             "href": f"/applications/{a['id']}"} for a in data["applications"]]}
    if name == "contacts_follow_up":
        return {"title": "Follow-ups due", "items": [
            {"label": c["name"], "detail": f"{c.get('company') or ''} · due {c['due']}".strip(" ·"),
             "href": "/contacts"} for c in data["due_or_overdue"]]}
    if name == "upcoming_interviews":
        return {"title": "Upcoming interviews", "items": [
            {"label": f"{i['role']} at {i['company']}", "detail": f"{i['type'] or 'Interview'} · {i['date'][:10]}",
             "href": "/agenda"} for i in data["interviews"]]}
    if name == "resume_usage":
        return {"title": "Resume usage", "items": [
            {"label": f"{r['name']} {r['version'] or ''}".strip(), "detail": f"{r['applications']} applications",
             "href": "/profile?tab=resumes"} for r in data["resumes"]]}
    if name == "interview_topics":
        return {"title": "Interview topics", "items": [
            {"label": t["topic"], "detail": f"{t['questions']} questions · confidence {t['avg_self_reported_confidence']}/5",
             "href": "/interviews"} for t in data["topics"]]}
    if name == "open_tasks":
        return {"title": "Open tasks", "items": [
            {"label": t["title"], "detail": f"due {t['due']}" if t["due"] else "no date", "href": "/agenda"}
            for t in data["tasks"]]}
    return None


def run_assistant(db: Session, user: models.User, history: list[dict]) -> dict:
    llm = require_llm()
    question = history[-1]["content"]
    calls, results, sources = gather_context(db, user.id, question)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + ANSWER_RULES.format(language=detect_language(question))},
        *[{"role": m["role"], "content": m["content"]} for m in history[-7:-1]],
        {"role": "user", "content": f"Today is {date.today().isoformat()}.\n\n<data>\n" + "\n\n".join(results)
         + f"\n</data>\n\nQuestion: {question}"},
    ]
    reply = llm.chat(messages, json_mode=False, max_tokens=600).strip()
    return {"reply": check_counts(reply, calls, sources, question) or "I couldn't find that in your data.",
            "tool_calls": calls, "sources": sources}


COUNT_CLAIM = re.compile(r"\b(\d+)\s+(?:\w+\s+){0,2}(?:applications?|candidatures?|jobs?|offres?|postings?|roles?|postes?)\b",
                         re.IGNORECASE)


def check_counts(reply: str, calls: list[dict], sources: list[dict], question: str) -> str:
    """Numbers are verified like quotes: if the answer states a different count of applications than
    the filtered search returned, it is replaced by a sentence built from the data itself."""
    search = next((c for c in calls if c["name"] == "search_applications" and len(c["input"]) > 1), None)
    source = next((s for s in sources if s["title"].startswith("Applications (")), None)
    if not search or not source:
        return reply
    total = int(source["title"][len("Applications ("):-1])
    claimed = {int(m.group(1)) for m in COUNT_CLAIM.finditer(reply)}
    if not claimed or claimed == {total}:
        return reply
    french = detect_language(question) == "French"
    names = [item["label"] for item in source["items"][:3]]
    more = total - len(names)
    if total == 0:
        return "Aucune candidature ne correspond." if french else "No application matches that."
    listed = ", ".join(names) + ((f" et {more} autre(s)" if french else f" and {more} more") if more > 0 else "")
    if french:
        return f"{total} candidature{'s' if total > 1 else ''} correspond{'ent' if total > 1 else ''} : {listed}."
    return f"{total} application{'s' if total != 1 else ''} match: {listed}."