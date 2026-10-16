"""Grounded AI features.

Pattern for every feature: we build the context ourselves (posting text, profile evidence with
ids, facts computed from the database), the model answers in JSON, and app.grounding removes
any claim whose quote or reference cannot be verified. The model never sees other users' data.
"""
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session, selectinload
from app import models
from app.ai import AIUnavailable, require_llm
from app.ai_schemas import Brief, Debrief, Draft, Feedback, PracticeSet
from app.analytics import RESPONSE_STATUSES
from app.grounding import Verifier, quote_in_source, relevant

GROUNDING_RULES = """Rules:
- Use ONLY the information given below. Never invent employers, skills, numbers or experiences.
- When a field asks for a "quote", copy the exact words from the posting (5 to 20 words).
- When a field asks for ids, use only ids that appear in brackets in the context, like E3 or F2.
- If you have nothing reliable for a list, return an empty list.
- Reply with ONE JSON object and nothing else."""


# ---------- Context builders ----------
def profile_evidence(db: Session, user: models.User) -> dict[str, str]:
    """Numbered, citable facts from the user's own profile: {"E1": "...", ...}."""
    items: dict[str, str] = {}
    evidences = selectinload(models.Skill.evidences)
    skills = (db.query(models.Skill)
              .options(evidences.selectinload(models.SkillEvidence.source_experience),
                       evidences.selectinload(models.SkillEvidence.source_project),
                       evidences.selectinload(models.SkillEvidence.source_education))
              .filter(models.Skill.owner_id == user.id).all())
    for skill in skills:
        for ev in skill.evidences:
            source = (f"{ev.source_experience.title} at {ev.source_experience.company}" if ev.source_experience
                      else f"project {ev.source_project.name}" if ev.source_project
                      else f"{ev.source_education.degree}, {ev.source_education.institution}" if ev.source_education
                      else ev.evidence_type.value.lower())
            items[f"E{len(items) + 1}"] = f"{skill.name}: {ev.description} ({source})"
    for exp in db.query(models.Experience).filter(models.Experience.owner_id == user.id):
        for line in (exp.achievements or "").splitlines():
            line = line.strip(" -•*")
            if line:
                items[f"E{len(items) + 1}"] = f"{exp.title} at {exp.company}: {line}"
    for project in db.query(models.Project).filter(models.Project.owner_id == user.id):
        if project.description:
            items[f"E{len(items) + 1}"] = f"Project {project.name}: {project.description[:200]}"
    return dict(list(items.items())[:60])


def _evidence_block(evidence: dict[str, str]) -> str:
    return "\n".join(f"[{k}] {v}" for k, v in evidence.items()) or "(the profile is empty)"


def _posting(app: models.Application) -> str:
    return (app.job_description or "").strip()


def _require_posting(app: models.Application) -> str:
    text = _posting(app)
    if len(text) < 80:
        raise AIUnavailable("Add the job description to this application first.")
    return text


# ---------- Application brief ----------
# The AI reads the posting (summary, priorities, questions, watch-outs, all quote-checked).
# Strengths and gaps come from the deterministic compatibility engine, which is exact.
BRIEF_SHAPE = """{
  "summary": "2 sentences: what this role is really about, in plain words",
  "priorities": [{"point": "something the employer clearly cares about", "quote": "exact words copied from the posting"}],
  "questions_to_ask": ["a smart question the candidate could ask the interviewer, specific to this posting"],
  "watch_outs": [{"point": "something vague, demanding or worth clarifying (on-call, travel, salary, scope)", "quote": "exact words copied from the posting"}]
}"""


def generate_brief(db: Session, user: models.User, app: models.Application) -> dict:
    from app.routers.matching import match_application  # avoids a circular import

    posting = _require_posting(app)
    llm = require_llm()
    raw = llm.complete_json(
        "You are a sharp career coach who reads job postings between the lines. " + GROUNDING_RULES,
        f"JSON shape:\n{BRIEF_SHAPE}\n\nGive 3 priorities, 3 questions and 1 or 2 watch-outs.\n\n"
        f"<posting role=\"{app.position_title}\" company=\"{app.company_name}\">\n{posting}\n</posting>",
        Brief, max_tokens=1200)
    check = Verifier()
    match = match_application(db, user, app)
    technical = match["components"]["technical"]["detail"]
    return {
        "summary": raw.summary,
        "priorities": [p.model_dump() for p in check.quoted(raw.priorities[:4], posting)],
        "questions_to_ask": raw.questions_to_ask[:4],
        "watch_outs": [w.model_dump() for w in check.quoted(raw.watch_outs[:3], posting)],
        "strengths": technical["confirmed"],
        "self_reported": technical["probable"],
        "gaps": technical["not_found"],
        "constraints": match["constraints"],
        "compatibility": match["overall"],
        "removed_claims": check.dropped,
    }

# ---------- Interview practice ----------
PRACTICE_SHAPE = """{"questions": [
  {"question": "an interview question", "topic": "one topic name from the list or null",
   "reason": "why it is likely for this posting, one sentence", "quote": "exact words from the posting or empty"}
]}"""


def generate_practice(db: Session, user: models.User, app: models.Application) -> dict:
    posting = _require_posting(app)
    topics = [t.name for t in db.query(models.QuestionTopic).filter(models.QuestionTopic.owner_id == user.id)]
    weak = _weak_topics(db, user)
    llm = require_llm()
    raw = llm.complete_json(
        "You prepare candidates for interviews with realistic, specific questions. " + GROUNDING_RULES,
        f"JSON shape:\n{PRACTICE_SHAPE}\n\nWrite 6 questions: a mix of technical and behavioral, specific to "
        f"this posting. Favour these topics where the candidate reported low confidence: "
        f"{', '.join(weak) or 'none recorded'}.\nTopic names allowed: {', '.join(topics) or 'none'}.\n\n"
        f"<posting role=\"{app.position_title}\" company=\"{app.company_name}\">\n{posting}\n</posting>",
        PracticeSet, max_tokens=1500)
    lookup = {t.lower(): t for t in topics}
    questions = []
    for q in raw.questions[:8]:
        if not q.question:
            continue
        q.topic = lookup.get((q.topic or "").lower())
        if q.quote and not quote_in_source(q.quote, posting):
            q.quote = ""  # keep the question, drop the unverifiable citation
        questions.append(q.model_dump())
    return {"questions": questions, "weak_topics": weak}


def _weak_topics(db: Session, user: models.User) -> list[str]:
    rows = (db.query(models.QuestionTopic.name, models.InterviewQuestion.confidence)
            .join(models.InterviewQuestion, models.InterviewQuestion.topic_id == models.QuestionTopic.id)
            .filter(models.InterviewQuestion.owner_id == user.id,
                    models.InterviewQuestion.confidence.isnot(None)).all())
    scores: dict[str, list[int]] = {}
    for name, confidence in rows:
        scores.setdefault(name, []).append(confidence)
    ranked = sorted(scores.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))
    return [name for name, values in ranked if sum(values) / len(values) < 3.5][:4]


# ---------- Answer coach ----------
FEEDBACK_SHAPE = """{
  "summary": "one or two sentences of honest overall feedback",
  "strengths": ["what works in the answer"],
  "improvements": ["concrete, actionable improvement"],
  "star": {"situation": true|false, "task": true|false, "action": true|false, "result": true|false},
  "evidence_ids": ["ids of the candidate's OWN recorded experiences that would make the answer stronger"]
}"""


def answer_feedback(db: Session, user: models.User, question: str, answer: str,
                    app: Optional[models.Application]) -> dict:
    evidence = profile_evidence(db, user)
    llm = require_llm()
    context = f"<posting>\n{_posting(app)[:4000]}\n</posting>\n\n" if app and _posting(app) else ""
    raw = llm.complete_json(
        "You are a supportive but honest interview coach. Judge only what the candidate wrote. "
        "The star field says which parts of the STAR structure (situation, task, action, result) are present. "
        + GROUNDING_RULES,
        f"JSON shape:\n{FEEDBACK_SHAPE}\n\n{context}<question>{question}</question>\n\n"
        f"<candidate_answer>\n{answer}\n</candidate_answer>\n\n"
        f"<candidate_evidence>\n{_evidence_block(evidence)}\n</candidate_evidence>",
        Feedback, max_tokens=1200)
    ids = [i for i in raw.evidence_ids if i in evidence and relevant(f"{question} {answer}", evidence[i])][:3]
    removed = len(raw.evidence_ids) - len(ids)
    return {**raw.model_dump(exclude={"evidence_ids"}),
            "suggested_evidence": [{"id": i, "text": evidence[i]} for i in ids],
            "removed_claims": removed}


# ---------- Message drafts ----------
DRAFT_KINDS = {
    "thank_you": "a short thank-you email sent after an interview",
    "follow_up": "a polite follow-up email asking for an update on the application",
    "networking": "a concise LinkedIn/email message to a contact at this company asking for a short chat",
}


def draft_message(db: Session, user: models.User, app: models.Application, kind: str,
                  contact: Optional[models.Contact], extra: str) -> dict:
    llm = require_llm()
    interviews = sorted(app.interviews, key=lambda i: i.scheduled_at)
    last = interviews[-1] if interviews else None
    sender = user.full_name or "[Your name]"
    recipient = (f"{contact.name}" + (f", {contact.role}" if contact.role else "")) if contact \
        else f"the recruiter at {app.company_name} (name unknown: greet with [Recruiter's name])"
    facts = [f"SENDER (you write as this person, sign with this name): {sender}",
             f"RECIPIENT (greet this person, never the sender): {recipient}",
             f"Role applied for: {app.position_title} at {app.company_name}",
             f"Current status: {app.status.value.replace('_', ' ').lower()}"]
    if app.applied_date:
        facts.append(f"Applied on {app.applied_date:%B %d, %Y}")
    if last:
        facts.append(f"Last interview: {last.interview_type or 'interview'} on {last.scheduled_at:%B %d}"
                     + (f" with {last.interviewer}" if last.interviewer else "")
                     + (f". Notes: {last.notes[:400]}" if last.notes else ""))
    if extra:
        facts.append(f"Points the candidate wants to include: {extra[:500]}")
    raw = llm.complete_json(
        "You ghost-write messages FOR a job candidate. The candidate is the sender; the recipient is "
        "the recruiter, interviewer or contact at the company. Write in the first person (\"I\"), "
        "warm and professional, in the same language as the role title. Use only the facts given. "
        "Where a detail is unknown, write a placeholder in square brackets like [topic we discussed]. "
        "No dates in the subject. Under 130 words. Sign with the candidate's name. Reply with JSON only.",
        f'JSON shape: {{"subject": "email subject (empty for LinkedIn)", "body": "the message"}}\n\n'
        f"Write {DRAFT_KINDS[kind]}.\nFacts:\n" + "\n".join(f"- {f}" for f in facts),
        Draft, max_tokens=700)
    return raw.model_dump()


# ---------- Weekly debrief ----------
def debrief_facts(db: Session, user: models.User) -> dict[str, str]:
    """Deterministic facts the AI may cite: {"F1": "..."}. All numbers come from the database."""
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    apps = (db.query(models.Application).options(selectinload(models.Application.company))
            .filter(models.Application.owner_id == user.id).all())
    events = (db.query(models.ApplicationEvent).join(models.Application)
              .filter(models.Application.owner_id == user.id, models.ApplicationEvent.occurred_at >= week_ago).all())
    facts: list[str] = []
    applied_week = [a for a in apps if a.applied_date and a.applied_date >= week_ago]
    facts.append(f"{len(applied_week)} applications submitted in the last 7 days")
    moves = Counter(e.to_status.value for e in events if e.event_type == models.EventType.STATUS_CHANGED and e.to_status)
    for status, n in moves.most_common():
        facts.append(f"{n} application(s) moved to {status.replace('_', ' ').lower()} this week")
    submitted = [a for a in apps if a.status.value not in ("SAVED", "PREPARING")]
    if submitted:
        responded = sum(1 for a in submitted if a.status.value in RESPONSE_STATUSES)
        facts.append(f"Observed response rate so far: {round(responded / len(submitted) * 100)}% "
                     f"({responded} of {len(submitted)} submitted)")
    waiting = [a for a in apps if a.status == models.ApplicationStatus.APPLIED and a.applied_date
               and a.applied_date <= now - timedelta(days=14)]
    for a in waiting[:3]:
        facts.append(f"No response for {(now - a.applied_date).days} days: {a.position_title} at {a.company_name}")
    upcoming = (db.query(models.Interview).join(models.Application)
                .filter(models.Application.owner_id == user.id, models.Interview.scheduled_at >= now,
                        models.Interview.scheduled_at <= now + timedelta(days=7)).all())
    for i in upcoming[:3]:
        facts.append(f"Interview on {i.scheduled_at:%A %b %d}: {i.interview_type or 'interview'} for "
                     f"{i.application.position_title} at {i.application.company_name}")
    overdue = (db.query(models.Task).filter(models.Task.owner_id == user.id, models.Task.completed_at.is_(None),
                                            models.Task.due_date < date.today()).count())
    if overdue:
        facts.append(f"{overdue} task(s) overdue")
    due_contacts = (db.query(models.Contact).filter(models.Contact.owner_id == user.id,
                                                    models.Contact.next_follow_up_at <= date.today()).all())
    for c in due_contacts[:3]:
        facts.append(f"Follow-up due with {c.name}" + (f" ({c.company_name})" if c.company_name else ""))
    saved_deadlines = [a for a in apps if a.deadline and a.status.value in ("SAVED", "PREPARING")
                       and date.today() <= a.deadline <= date.today() + timedelta(days=7)]
    for a in saved_deadlines[:3]:
        facts.append(f"Deadline {a.deadline:%b %d} for {a.position_title} at {a.company_name} (not submitted yet)")
    weak = _weak_topics(db, user)
    if weak:
        facts.append(f"Lowest self-reported interview confidence: {', '.join(weak)}")
    return {f"F{i + 1}": f for i, f in enumerate(facts)}


DEBRIEF_SHAPE = """{
  "headline": "one short sentence summarizing the week",
  "observations": [{"text": "a factual observation", "fact_ids": ["F1"]}],
  "focus": [{"text": "a concrete action for the coming week", "fact_ids": ["F3"]}]
}"""


def generate_debrief(db: Session, user: models.User) -> dict:
    facts = debrief_facts(db, user)
    llm = require_llm()
    raw = llm.complete_json(
        "You are a calm, encouraging job-search coach writing a weekly debrief. Describe what happened "
        "and suggest at most 3 focused actions. Never predict outcomes or chances of being hired. "
        + GROUNDING_RULES,
        f"JSON shape:\n{DEBRIEF_SHAPE}\n\nAt most 3 observations and 3 focus actions. Every item must cite "
        f"the fact ids it is based on.\n\n<facts>\n" + "\n".join(f"[{k}] {v}" for k, v in facts.items())
        + "\n</facts>",
        Debrief, max_tokens=900)
    check = Verifier()
    observations = check.referenced(raw.observations[:3], set(facts), attr="fact_ids")
    focus = check.referenced(raw.focus[:3], set(facts), attr="fact_ids")
    return {"headline": raw.headline, "observations": [o.model_dump() for o in observations],
            "focus": [f.model_dump() for f in focus], "facts": facts, "removed_claims": check.dropped}
