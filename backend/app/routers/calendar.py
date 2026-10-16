from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/interviews", response_model=list[schemas.InterviewOut])
def list_interviews(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = (db.query(models.Interview)
         .join(models.Application)
         .filter(models.Application.owner_id == current_user.id))

    if start:
        q = q.filter(models.Interview.scheduled_at >= start)
    if end:
        q = q.filter(models.Interview.scheduled_at <= end)

    return q.order_by(models.Interview.scheduled_at.asc()).all()