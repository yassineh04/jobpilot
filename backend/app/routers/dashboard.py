from collections import Counter
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from app.analytics import RESPONSE_STATUSES
from app.database import get_db
from app.dependencies import get_current_user
from app.skills_catalog import detect_skills
from app import models

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

CLOSED = {models.ApplicationStatus.REJECTED, models.ApplicationStatus.WITHDRAWN,
          models.ApplicationStatus.OFFER}
NOT_SUBMITTED = {models.ApplicationStatus.SAVED, models.ApplicationStatus.PREPARING}


def _app_ref(a: models.Application) -> dict:
    return {"id": str(a.id), "company_name": a.company_name,
            "position_title": a.position_title, "status": a.status.value}


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    now = datetime.utcnow()
    today = date.today()
    apps = (db.query(models.Application)
            .options(selectinload(models.Application.company))
            .filter(models.Application.owner_id == user.id).all())
    by_id = {a.id: a for a in apps}

    upcoming = (db.query(models.Interview)
                .join(models.Application)
                .filter(models.Application.owner_id == user.id,
                        models.Interview.scheduled_at >= now,
                        models.Interview.scheduled_at <= now + timedelta(days=14))
                .order_by(models.Interview.scheduled_at.asc()).all())

    open_tasks = (db.query(models.Task)
                  .filter(models.Task.owner_id == user.id, models.Task.completed_at.is_(None))
                  .order_by(models.Task.due_date.asc().nulls_last()).all())
    due_tasks = [t for t in open_tasks if t.due_date and t.due_date <= today]
    due_contacts = (db.query(models.Contact)
                    .filter(models.Contact.owner_id == user.id,
                            models.Contact.next_follow_up_at <= today)
                    .order_by(models.Contact.next_follow_up_at.asc()).all())

    events = (db.query(models.ApplicationEvent)
              .join(models.Application)
              .filter(models.Application.owner_id == user.id)
              .order_by(models.ApplicationEvent.occurred_at.desc())
              .limit(8).all())

    status_counts = Counter(a.status.value for a in apps)
    submitted = [a for a in apps if a.status not in NOT_SUBMITTED]
    responded = [a for a in submitted if a.status.value in RESPONSE_STATUSES]
    waiting = [a for a in submitted
               if a.status == models.ApplicationStatus.APPLIED and a.applied_date
               and a.applied_date <= now - timedelta(days=14)]

    skill_counter: Counter = Counter()
    for a in apps:
        if a.job_description:
            skill_counter.update(set(detect_skills(a.job_description)))
    locations = Counter(a.location for a in apps if a.location)

    deadlines = sorted((a for a in apps if a.deadline and a.deadline >= today
                        and a.status in NOT_SUBMITTED), key=lambda a: a.deadline)[:5]

    return {
        "user_name": user.full_name or user.email.split("@")[0],
        "kpis": {
            "active_applications": sum(1 for a in submitted if a.status not in CLOSED),
            "upcoming_interviews": len(upcoming),
            "follow_ups_due": len(due_tasks) + len(due_contacts),
            "applied_this_week": sum(1 for a in apps
                                     if a.applied_date and a.applied_date >= now - timedelta(days=7)),
            "response_rate": round(len(responded) / len(submitted) * 100, 1) if submitted else None,
            "submitted": len(submitted),
        },
        "pipeline": [{"status": s.value, "count": status_counts.get(s.value, 0)}
                     for s in models.ApplicationStatus],
        "upcoming_interviews": [{
            "id": str(i.id), "scheduled_at": i.scheduled_at.isoformat(),
            "interview_type": i.interview_type, "location_or_link": i.location_or_link,
            "application": _app_ref(by_id[i.application_id]) if i.application_id in by_id else None,
        } for i in upcoming[:5]],
        "follow_ups": (
            [{"kind": "task", "id": str(t.id), "title": t.title, "due_date": t.due_date.isoformat()}
             for t in due_tasks[:5]] +
            [{"kind": "contact", "id": str(c.id), "title": f"Follow up with {c.name}"
              + (f" ({c.company_name})" if c.company_name else ""),
              "due_date": c.next_follow_up_at.isoformat()} for c in due_contacts[:5]]
        ),
        "deadlines": [{**_app_ref(a), "deadline": a.deadline.isoformat()} for a in deadlines],
        "waiting_for_response": [_app_ref(a) for a in
                                 sorted(waiting, key=lambda a: a.applied_date)[:5]],
        "recent_activity": [{
            "id": str(e.id), "event_type": e.event_type.value,
            "from_status": e.from_status.value if e.from_status else None,
            "to_status": e.to_status.value if e.to_status else None,
            "description": e.description, "occurred_at": e.occurred_at.isoformat(),
            "application": _app_ref(by_id[e.application_id]) if e.application_id in by_id else None,
        } for e in events],
        "insights": {
            "top_skill": skill_counter.most_common(1)[0][0] if skill_counter else None,
            "top_skill_count": skill_counter.most_common(1)[0][1] if skill_counter else 0,
            "top_location": locations.most_common(1)[0][0] if locations else None,
            "postings_analyzed": sum(1 for a in apps if a.job_description),
        },
        "has_profile": db.query(func.count(models.Skill.id))
                         .filter(models.Skill.owner_id == user.id).scalar() > 0,
    }
