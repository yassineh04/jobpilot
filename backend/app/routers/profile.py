import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from app.database import get_db
from app.dependencies import get_current_user
from app.skills_catalog import category_of
from app import models, schemas

router = APIRouter(prefix="/profile", tags=["profile"])


def _owned_or_404(db, model, obj_id, user):
    obj = db.query(model).filter(model.id == obj_id, model.owner_id == user.id).first()
    if not obj:
        raise HTTPException(404, f"{model.__name__} not found")
    return obj


# ---------- Digital profile summary ----------
@router.get("/summary")
def profile_summary(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Per-category view built only from explicit skills and their evidence (no inferred levels)."""
    skills = (db.query(models.Skill)
              .options(selectinload(models.Skill.evidences))
              .filter(models.Skill.owner_id == user.id).all())
    categories: dict[str, dict] = {}
    for skill in skills:
        category = skill.category or category_of(skill.name) or "Other"
        entry = categories.setdefault(category, {"category": category, "skills": [],
                                                 "evidenced": 0, "evidence_items": 0})
        entry["skills"].append({"name": skill.name, "evidence_count": len(skill.evidences),
                                "proficiency": skill.proficiency.value if skill.proficiency else None})
        entry["evidence_items"] += len(skill.evidences)
        entry["evidenced"] += 1 if skill.evidences else 0

    counts = {
        "experiences": db.query(models.Experience).filter(models.Experience.owner_id == user.id).count(),
        "projects": db.query(models.Project).filter(models.Project.owner_id == user.id).count(),
        "education": db.query(models.Education).filter(models.Education.owner_id == user.id).count(),
        "languages": db.query(models.Language).filter(models.Language.owner_id == user.id).count(),
    }
    has_preferences = db.query(models.PreferredLocation).join(models.CandidatePreference).filter(
        models.CandidatePreference.owner_id == user.id).first() is not None
    checklist = [
        {"key": "experiences", "label": "Add work experience", "done": counts["experiences"] > 0},
        {"key": "skills", "label": "List your skills", "done": len(skills) > 0},
        {"key": "evidence", "label": "Back skills with evidence",
         "done": any(s.evidences for s in skills)},
        {"key": "education", "label": "Add education", "done": counts["education"] > 0},
        {"key": "preferences", "label": "Set job preferences", "done": has_preferences},
    ]
    return {
        "categories": sorted(categories.values(), key=lambda c: (-c["evidenced"], -len(c["skills"]))),
        "totals": {**counts, "skills": len(skills),
                   "evidenced_skills": sum(1 for s in skills if s.evidences)},
        "checklist": checklist,
        "completeness": round(sum(1 for c in checklist if c["done"]) / len(checklist) * 100),
        "label": "Built from the skills and evidence you entered. Bars show how many skills in each "
                 "area are backed by at least one piece of evidence, not a skill level.",
    }


# ---------- Education ----------
@router.get("/education", response_model=List[schemas.EducationOut])
def list_education(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.Education).filter(models.Education.owner_id == user.id).all()


@router.post("/education", response_model=schemas.EducationOut, status_code=201)
def create_education(payload: schemas.EducationIn, db: Session = Depends(get_db),
                      user=Depends(get_current_user)):
    obj = models.Education(**payload.model_dump(), owner_id=user.id)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.patch("/education/{item_id}", response_model=schemas.EducationOut)
def update_education(item_id: uuid.UUID, payload: schemas.EducationIn,
                      db: Session = Depends(get_db), user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Education, item_id, user)
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/education/{item_id}", status_code=204)
def delete_education(item_id: uuid.UUID, db: Session = Depends(get_db),
                      user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Education, item_id, user)
    db.delete(obj); db.commit()


# ---------- Experience ----------
@router.get("/experiences", response_model=List[schemas.ExperienceOut])
def list_experiences(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.Experience).filter(models.Experience.owner_id == user.id).all()


@router.post("/experiences", response_model=schemas.ExperienceOut, status_code=201)
def create_experience(payload: schemas.ExperienceIn, db: Session = Depends(get_db),
                       user=Depends(get_current_user)):
    obj = models.Experience(**payload.model_dump(), owner_id=user.id)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.patch("/experiences/{item_id}", response_model=schemas.ExperienceOut)
def update_experience(item_id: uuid.UUID, payload: schemas.ExperienceIn,
                       db: Session = Depends(get_db), user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Experience, item_id, user)
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/experiences/{item_id}", status_code=204)
def delete_experience(item_id: uuid.UUID, db: Session = Depends(get_db),
                       user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Experience, item_id, user)
    db.delete(obj); db.commit()


# ---------- Projects ----------
@router.get("/projects", response_model=List[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.Project).filter(models.Project.owner_id == user.id).all()


@router.post("/projects", response_model=schemas.ProjectOut, status_code=201)
def create_project(payload: schemas.ProjectIn, db: Session = Depends(get_db),
                    user=Depends(get_current_user)):
    obj = models.Project(**payload.model_dump(), owner_id=user.id)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.patch("/projects/{item_id}", response_model=schemas.ProjectOut)
def update_project(item_id: uuid.UUID, payload: schemas.ProjectIn,
                    db: Session = Depends(get_db), user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Project, item_id, user)
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/projects/{item_id}", status_code=204)
def delete_project(item_id: uuid.UUID, db: Session = Depends(get_db),
                    user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Project, item_id, user)
    db.delete(obj); db.commit()


# ---------- Skills + Evidence ----------
@router.get("/skills", response_model=List[schemas.SkillOut])
def list_skills(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return (db.query(models.Skill)
            .options(joinedload(models.Skill.evidences))
            .filter(models.Skill.owner_id == user.id)
            .all())


@router.post("/skills", response_model=schemas.SkillOut, status_code=201)
def create_skill(payload: schemas.SkillIn, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    existing = db.query(models.Skill).filter(
        models.Skill.owner_id == user.id, models.Skill.name.ilike(payload.name)
    ).first()
    if existing:
        raise HTTPException(400, "This skill already exists in your profile.")
    obj = models.Skill(**payload.model_dump(), owner_id=user.id)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.patch("/skills/{item_id}", response_model=schemas.SkillOut)
def update_skill(item_id: uuid.UUID, payload: schemas.SkillIn,
                  db: Session = Depends(get_db), user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Skill, item_id, user)
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    db.commit(); db.refresh(obj)
    return obj


@router.delete("/skills/{item_id}", status_code=204)
def delete_skill(item_id: uuid.UUID, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Skill, item_id, user)
    db.delete(obj); db.commit()


@router.post("/skills/{skill_id}/evidence", response_model=schemas.SkillEvidenceOut, status_code=201)
def add_skill_evidence(skill_id: uuid.UUID, payload: schemas.SkillEvidenceIn,
                        db: Session = Depends(get_db), user=Depends(get_current_user)):
    skill = _owned_or_404(db, models.Skill, skill_id, user)

    # Validate the referenced source belongs to the user (never invent evidence)
    if payload.source_experience_id:
        _owned_or_404(db, models.Experience, payload.source_experience_id, user)
    if payload.source_project_id:
        _owned_or_404(db, models.Project, payload.source_project_id, user)
    if payload.source_education_id:
        _owned_or_404(db, models.Education, payload.source_education_id, user)

    evidence = models.SkillEvidence(**payload.model_dump(), skill_id=skill.id)
    db.add(evidence); db.commit(); db.refresh(evidence)
    return evidence


@router.delete("/skills/{skill_id}/evidence/{evidence_id}", status_code=204)
def delete_skill_evidence(skill_id: uuid.UUID, evidence_id: uuid.UUID,
                           db: Session = Depends(get_db), user=Depends(get_current_user)):
    _owned_or_404(db, models.Skill, skill_id, user)
    evidence = db.query(models.SkillEvidence).filter(
        models.SkillEvidence.id == evidence_id,
        models.SkillEvidence.skill_id == skill_id,
    ).first()
    if not evidence:
        raise HTTPException(404, "Evidence not found")
    db.delete(evidence); db.commit()


# ---------- Languages ----------
@router.get("/languages", response_model=List[schemas.LanguageOut])
def list_languages(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.Language).filter(models.Language.owner_id == user.id).all()


@router.post("/languages", response_model=schemas.LanguageOut, status_code=201)
def create_language(payload: schemas.LanguageIn, db: Session = Depends(get_db),
                     user=Depends(get_current_user)):
    obj = models.Language(**payload.model_dump(), owner_id=user.id)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@router.delete("/languages/{item_id}", status_code=204)
def delete_language(item_id: uuid.UUID, db: Session = Depends(get_db),
                     user=Depends(get_current_user)):
    obj = _owned_or_404(db, models.Language, item_id, user)
    db.delete(obj); db.commit()


# ---------- Preferences (singleton) ----------
@router.get("/preferences", response_model=schemas.CandidatePreferenceOut)
def get_preferences(db: Session = Depends(get_db), user=Depends(get_current_user)):
    pref = db.query(models.CandidatePreference).filter(
        models.CandidatePreference.owner_id == user.id
    ).first()
    if not pref:
        pref = models.CandidatePreference(owner_id=user.id)
        db.add(pref); db.commit(); db.refresh(pref)
    return pref


@router.put("/preferences", response_model=schemas.CandidatePreferenceOut)
def update_preferences(payload: schemas.CandidatePreferenceIn,
                        db: Session = Depends(get_db), user=Depends(get_current_user)):
    pref = db.query(models.CandidatePreference).filter(
        models.CandidatePreference.owner_id == user.id
    ).first()
    if not pref:
        pref = models.CandidatePreference(owner_id=user.id)
        db.add(pref); db.flush()

    pref.remote_preference = payload.remote_preference
    pref.desired_employment_type = payload.desired_employment_type
    pref.salary_expectation_min = payload.salary_expectation_min
    pref.salary_expectation_max = payload.salary_expectation_max
    pref.currency = payload.currency or "CAD"

    db.query(models.PreferredLocation).filter(
        models.PreferredLocation.preference_id == pref.id).delete()
    db.query(models.DesiredRole).filter(
        models.DesiredRole.preference_id == pref.id).delete()
    db.flush()

    for loc in {l.strip() for l in payload.locations if l.strip()}:
        db.add(models.PreferredLocation(preference_id=pref.id, location=loc))
    for role in {r.strip() for r in payload.desired_roles if r.strip()}:
        db.add(models.DesiredRole(preference_id=pref.id, role=role))

    db.commit(); db.refresh(pref)
    return pref