import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas

router = APIRouter(prefix="/interviews", tags=["interviews"])


def _get_owned_interview(db: Session, interview_id: uuid.UUID, user: models.User):
    obj = (db.query(models.Interview)
           .join(models.Application)
           .filter(models.Interview.id == interview_id,
                   models.Application.owner_id == user.id)
           .first())
    if not obj:
        raise HTTPException(404, "Interview not found")
    return obj


@router.patch("/{interview_id}", response_model=schemas.InterviewOut)
def update_interview(interview_id: uuid.UUID, payload: schemas.InterviewUpdate,
                      db: Session = Depends(get_db),
                      user: models.User = Depends(get_current_user)):
    obj = _get_owned_interview(db, interview_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{interview_id}", status_code=204)
def delete_interview(interview_id: uuid.UUID, db: Session = Depends(get_db),
                      user: models.User = Depends(get_current_user)):
    obj = _get_owned_interview(db, interview_id, user)
    db.delete(obj)
    db.commit()