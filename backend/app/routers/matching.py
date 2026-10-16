import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from app.database import get_db
from app.dependencies import get_current_user
from app import models
from app.matching import compute_match

router = APIRouter(prefix="/applications", tags=["matching"])


def match_application(db: Session, user: models.User, application: models.Application) -> dict:
    """Loads the user's profile (no N+1) and computes the deterministic compatibility."""
    evidences = selectinload(models.Skill.evidences)
    skills = (db.query(models.Skill)
              .options(evidences.selectinload(models.SkillEvidence.source_experience),
                       evidences.selectinload(models.SkillEvidence.source_project),
                       evidences.selectinload(models.SkillEvidence.source_education))
              .filter(models.Skill.owner_id == user.id)
              .all())
    experiences = db.query(models.Experience).filter(models.Experience.owner_id == user.id).all()
    educations = db.query(models.Education).filter(models.Education.owner_id == user.id).all()
    preference = db.query(models.CandidatePreference).filter(
        models.CandidatePreference.owner_id == user.id
    ).options(joinedload(models.CandidatePreference.locations)).first()
    return compute_match(application, skills, experiences, educations, preference)


@router.get("/{app_id}/match")
def get_application_match(app_id: uuid.UUID, db: Session = Depends(get_db),
                           user: models.User = Depends(get_current_user)):
    application = db.query(models.Application).filter(
        models.Application.id == app_id,
        models.Application.owner_id == user.id,
    ).first()
    if not application:
        raise HTTPException(404, "Application not found")
    return match_application(db, user, application)
