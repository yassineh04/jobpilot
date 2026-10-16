from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models
from app.analytics import (build_funnel, build_rejection_stats, build_resume_comparison,
                           build_breakdowns, build_timing)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _load_rows(db: Session, user: models.User) -> list[dict]:
    """One query, no N+1: applications joined with their interview count."""
    query = (db.query(models.Application.id,
                      models.Application.status,
                      models.Application.resume_id,
                      models.Application.rejection_reason,
                      models.Application.applied_date,
                      models.Application.source,
                      models.Application.location,
                      models.Application.work_mode,
                      func.count(models.Interview.id).label("interview_count"))
             .outerjoin(models.Interview, models.Interview.application_id == models.Application.id)
             .filter(models.Application.owner_id == user.id)
             .group_by(models.Application.id))
    return [{
        "id": r.id,
        "status": r.status.value,
        "resume_id": r.resume_id,
        "rejection_reason": r.rejection_reason.value if r.rejection_reason else None,
        "applied_date": r.applied_date,
        "source": (r.source or "").strip() or None,
        "location": (r.location or "").strip() or None,
        "work_mode": r.work_mode.value if r.work_mode else None,
        "has_interview": r.interview_count > 0,
    } for r in query.all()]


def _timing(db: Session, user: models.User, rows: list[dict]) -> dict:
    events = (db.query(models.ApplicationEvent.application_id,
                       models.ApplicationEvent.occurred_at,
                       models.ApplicationEvent.to_status)
              .join(models.Application)
              .filter(models.Application.owner_id == user.id)
              .order_by(models.ApplicationEvent.occurred_at.asc()).all())
    by_app = defaultdict(list)
    for app_id, occurred_at, to_status in events:
        by_app[app_id].append((occurred_at, to_status.value if to_status else None))
    return build_timing(by_app, {r["id"]: r["applied_date"] for r in rows})


@router.get("/overview")
def overview(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = _load_rows(db, user)
    rejected = [r["rejection_reason"] for r in rows if r["status"] == "REJECTED"]
    return {
        "total_applications": len(rows),
        "funnel": build_funnel(rows),
        "rejections": build_rejection_stats(rejected),
        "breakdowns": build_breakdowns(rows),
        "timing": _timing(db, user, rows),
    }


@router.get("/resumes")
def resume_comparison(db: Session = Depends(get_db),
                       user: models.User = Depends(get_current_user)):
    rows = _load_rows(db, user)
    names = {r.id: f"{r.name} · {r.version}" if r.version else r.name
             for r in db.query(models.Resume).filter(models.Resume.owner_id == user.id).all()}
    return build_resume_comparison(rows, names)
