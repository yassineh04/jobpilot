import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload, undefer
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas
from app.job_parser import parse_job_text
from app.matching import compute_match
from app.skills_catalog import mentioned_in

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


def _owned(db: Session, user: models.User, app_id: uuid.UUID) -> models.Application:
    application = db.query(models.Application).filter(
        models.Application.id == app_id,
        models.Application.owner_id == user.id,
    ).first()
    if not application:
        raise HTTPException(404, "Application not found")
    return application


@router.get("/{app_id}/match")
def get_application_match(app_id: uuid.UUID, db: Session = Depends(get_db),
                           user: models.User = Depends(get_current_user)):
    return match_application(db, user, _owned(db, user, app_id))


@router.get("/{app_id}/cv-check", response_model=schemas.CVCheckOut)
def cv_check(app_id: uuid.UUID, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Which skills the posting asks for are written in the CV itself, as a keyword filter would see it.
    Uses the resume attached to the application, or else the most recent one with a PDF."""
    application = _owned(db, user, app_id)
    resumes = (db.query(models.Resume).options(undefer(models.Resume.content))
               .filter(models.Resume.owner_id == user.id, models.Resume.content.isnot(None))
               .order_by(models.Resume.updated_at.desc()).all())
    resume = next((r for r in resumes if r.id == application.resume_id), resumes[0] if resumes else None)
    if not (application.job_description or "").strip():
        return schemas.CVCheckOut(status="no_posting")
    if resume is None:
        return schemas.CVCheckOut(status="no_resume")
    posting = parse_job_text(application.job_description)
    check = lambda skills: [schemas.CVKeyword(skill=s, in_cv=mentioned_in(s, resume.content))  # noqa: E731
                            for s in skills]
    required, preferred = check(posting.required_skills), check(posting.preferred_skills)
    found = sum(k.in_cv for k in required)
    return schemas.CVCheckOut(
        status="ok", required=required, preferred=preferred,
        coverage=round(found / len(required) * 100) if required else None,
        resume=schemas.CVCheckResume(id=resume.id, name=resume.name, version=resume.version,
                                     attached=resume.id == application.resume_id))
