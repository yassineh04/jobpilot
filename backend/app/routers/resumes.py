import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas

router = APIRouter(prefix="/resumes", tags=["resumes"])


def _out(resume: models.Resume, count: int) -> schemas.ResumeOut:
    return schemas.ResumeOut(
        id=resume.id, name=resume.name, target_role=resume.target_role,
        version=resume.version, notes=resume.notes,
        created_at=resume.created_at, updated_at=resume.updated_at,
        application_count=count,
    )


def _get_owned(db: Session, resume_id: uuid.UUID, user: models.User) -> models.Resume:
    obj = db.query(models.Resume).filter(
        models.Resume.id == resume_id, models.Resume.owner_id == user.id).first()
    if not obj:
        raise HTTPException(404, "Resume not found")
    return obj


def _count(db: Session, resume_id: uuid.UUID) -> int:
    return db.query(func.count(models.Application.id)).filter(
        models.Application.resume_id == resume_id).scalar() or 0


@router.get("/", response_model=List[schemas.ResumeOut])
def list_resumes(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = (db.query(models.Resume, func.count(models.Application.id))
            .outerjoin(models.Application, models.Application.resume_id == models.Resume.id)
            .filter(models.Resume.owner_id == user.id)
            .group_by(models.Resume.id)
            .order_by(models.Resume.updated_at.desc())
            .all())
    return [_out(resume, count) for resume, count in rows]


@router.post("/", response_model=schemas.ResumeOut, status_code=201)
def create_resume(payload: schemas.ResumeIn, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    obj = models.Resume(**payload.model_dump(), owner_id=user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _out(obj, 0)


@router.patch("/{resume_id}", response_model=schemas.ResumeOut)
def update_resume(resume_id: uuid.UUID, payload: schemas.ResumeIn,
                   db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    obj = _get_owned(db, resume_id, user)
    for field, value in payload.model_dump().items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return _out(obj, _count(db, obj.id))


@router.delete("/{resume_id}", status_code=204)
def delete_resume(resume_id: uuid.UUID, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    obj = _get_owned(db, resume_id, user)
    db.query(models.Application).filter(
        models.Application.resume_id == obj.id).update({"resume_id": None})
    db.delete(obj)
    db.commit()