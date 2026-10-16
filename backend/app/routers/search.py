from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models

router = APIRouter(prefix="/search", tags=["search"])

PER_GROUP = 6


def _snippet(text: str | None, needle: str, width: int = 70) -> str | None:
    if not text:
        return None
    idx = text.lower().find(needle.lower())
    if idx < 0:
        return None
    start = max(idx - width // 2, 0)
    end = min(idx + len(needle) + width // 2, len(text))
    return ("…" if start else "") + text[start:end].replace("\n", " ").strip() + ("…" if end < len(text) else "")


@router.get("/")
def global_search(q: str = Query(min_length=2, max_length=100),
                  db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    like = f"%{q}%"
    groups = []

    apps = (db.query(models.Application).join(models.Company)
            .filter(models.Application.owner_id == user.id,
                    or_(models.Application.position_title.ilike(like), models.Company.name.ilike(like),
                        models.Application.job_description.ilike(like),
                        models.Application.notes.ilike(like), models.Application.location.ilike(like)))
            .order_by(models.Application.updated_at.desc()).limit(PER_GROUP).all())
    groups.append({"type": "applications", "label": "Applications", "items": [{
        "id": str(a.id), "title": a.position_title, "subtitle": a.company_name,
        "snippet": _snippet(a.job_description, q) or _snippet(a.notes, q),
        "href": f"/applications/{a.id}"} for a in apps]})

    companies = (db.query(models.Company)
                 .filter(models.Company.owner_id == user.id,
                         or_(models.Company.name.ilike(like), models.Company.notes.ilike(like)))
                 .limit(PER_GROUP).all())
    groups.append({"type": "companies", "label": "Companies", "items": [{
        "id": str(c.id), "title": c.name, "subtitle": c.industry,
        "snippet": _snippet(c.notes, q), "href": f"/applications?search={c.name}"} for c in companies]})

    contacts = (db.query(models.Contact)
                .filter(models.Contact.owner_id == user.id,
                        or_(models.Contact.name.ilike(like), models.Contact.role.ilike(like),
                            models.Contact.notes.ilike(like)))
                .limit(PER_GROUP).all())
    groups.append({"type": "contacts", "label": "Contacts", "items": [{
        "id": str(c.id), "title": c.name,
        "subtitle": " · ".join(x for x in (c.role, c.company_name) if x) or None,
        "snippet": _snippet(c.notes, q), "href": f"/contacts?focus={c.id}"} for c in contacts]})

    questions = (db.query(models.InterviewQuestion)
                 .filter(models.InterviewQuestion.owner_id == user.id,
                         or_(models.InterviewQuestion.question.ilike(like),
                             models.InterviewQuestion.user_answer.ilike(like),
                             models.InterviewQuestion.notes.ilike(like),
                             models.InterviewQuestion.company.ilike(like)))
                 .limit(PER_GROUP).all())
    groups.append({"type": "questions", "label": "Interview questions", "items": [{
        "id": str(x.id), "title": x.question[:120], "subtitle": x.company,
        "snippet": _snippet(x.user_answer, q), "href": "/interviews"} for x in questions]})

    interviews = (db.query(models.Interview).join(models.Application)
                  .filter(models.Application.owner_id == user.id,
                          or_(models.Interview.notes.ilike(like), models.Interview.interviewer.ilike(like),
                              models.Interview.interview_type.ilike(like)))
                  .limit(PER_GROUP).all())
    groups.append({"type": "interviews", "label": "Interviews", "items": [{
        "id": str(i.id), "title": f"{i.interview_type or 'Interview'} · {i.application.company_name}",
        "subtitle": i.scheduled_at.strftime("%b %d, %Y"), "snippet": _snippet(i.notes, q),
        "href": f"/applications/{i.application_id}"} for i in interviews]})

    skills = (db.query(models.Skill)
              .filter(models.Skill.owner_id == user.id, models.Skill.name.ilike(like))
              .limit(PER_GROUP).all())
    projects = (db.query(models.Project)
                .filter(models.Project.owner_id == user.id,
                        or_(models.Project.name.ilike(like), models.Project.description.ilike(like)))
                .limit(PER_GROUP).all())
    groups.append({"type": "profile", "label": "Profile", "items": [
        *[{"id": str(s.id), "title": s.name, "subtitle": "Skill", "snippet": None,
           "href": "/profile?tab=skills"} for s in skills],
        *[{"id": str(p.id), "title": p.name, "subtitle": "Project",
           "snippet": _snippet(p.description, q), "href": "/profile?tab=projects"} for p in projects],
    ][:PER_GROUP]})

    tasks = (db.query(models.Task)
             .filter(models.Task.owner_id == user.id, models.Task.title.ilike(like))
             .limit(PER_GROUP).all())
    groups.append({"type": "tasks", "label": "Tasks", "items": [{
        "id": str(t.id), "title": t.title, "subtitle": "Done" if t.done else "Open",
        "snippet": None, "href": "/agenda"} for t in tasks]})

    groups = [g for g in groups if g["items"]]
    return {"query": q, "total": sum(len(g["items"]) for g in groups), "groups": groups}
