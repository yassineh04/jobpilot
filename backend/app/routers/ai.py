import uuid
from datetime import datetime
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app import models
from app.ai import AIUnavailable, ai_config, ai_status
from app.ai_features import (answer_feedback, draft_message, generate_brief,
                             generate_debrief, generate_practice)
from app.database import get_db
from app.dependencies import get_current_user
from app.rate_limit import ai_rate_limit
from app.routers.applications import get_owned_application

router = APIRouter(prefix="/ai", tags=["ai"])


class FeedbackIn(BaseModel):
    question: str = Field(min_length=5, max_length=1000)
    answer: str = Field(min_length=20, max_length=6000)
    application_id: Optional[uuid.UUID] = None


class DraftIn(BaseModel):
    kind: Literal["thank_you", "follow_up", "networking"]
    contact_id: Optional[uuid.UUID] = None
    notes: str = Field(default="", max_length=500)


def _run(fn, *args):
    try:
        return fn(*args)
    except AIUnavailable as exc:
        raise HTTPException(503, str(exc))


@router.get("/status")
def status():
    return ai_status()


@router.get("/applications/{app_id}/brief")
def get_brief(app_id: uuid.UUID, db: Session = Depends(get_db),
              user: models.User = Depends(get_current_user)):
    app = get_owned_application(app_id, db, user)
    if not app.brief:
        raise HTTPException(404, "No brief yet")
    return {**app.brief.content, "model": app.brief.model, "created_at": app.brief.created_at}


@router.post("/applications/{app_id}/brief")
def create_brief(app_id: uuid.UUID, db: Session = Depends(get_db),
                 user: models.User = Depends(ai_rate_limit)):
    app = get_owned_application(app_id, db, user)
    content = _run(generate_brief, db, user, app)
    model = ai_config().model
    if app.brief:
        app.brief.content, app.brief.model, app.brief.created_at = content, model, datetime.utcnow()
    else:
        db.add(models.ApplicationBrief(application_id=app.id, content=content, model=model))
    db.commit()
    db.refresh(app)
    return {**content, "model": model, "created_at": app.brief.created_at}


@router.post("/applications/{app_id}/practice")
def practice_questions(app_id: uuid.UUID, db: Session = Depends(get_db),
                       user: models.User = Depends(ai_rate_limit)):
    app = get_owned_application(app_id, db, user)
    return _run(generate_practice, db, user, app)


@router.post("/feedback")
def feedback(payload: FeedbackIn, db: Session = Depends(get_db),
             user: models.User = Depends(ai_rate_limit)):
    app = get_owned_application(payload.application_id, db, user) if payload.application_id else None
    return _run(answer_feedback, db, user, payload.question.strip(), payload.answer.strip(), app)


@router.post("/applications/{app_id}/draft")
def draft(app_id: uuid.UUID, payload: DraftIn, db: Session = Depends(get_db),
          user: models.User = Depends(ai_rate_limit)):
    app = get_owned_application(app_id, db, user)
    contact = None
    if payload.contact_id:
        contact = db.query(models.Contact).filter(models.Contact.id == payload.contact_id,
                                                  models.Contact.owner_id == user.id).first()
        if not contact:
            raise HTTPException(404, "Contact not found")
    return _run(draft_message, db, user, app, payload.kind, contact, payload.notes.strip())


@router.post("/debrief")
def debrief(db: Session = Depends(get_db), user: models.User = Depends(ai_rate_limit)):
    return _run(generate_debrief, db, user)
