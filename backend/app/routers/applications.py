import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_
from app.database import get_db
from app.dependencies import get_current_user
from app.events import record_event
from app import models, schemas

router = APIRouter(prefix="/applications", tags=["applications"])

NOT_SUBMITTED = (models.ApplicationStatus.SAVED, models.ApplicationStatus.PREPARING)


def _check_resume(db: Session, user: models.User, resume_id):
    if resume_id and not db.query(models.Resume.id).filter(
            models.Resume.id == resume_id, models.Resume.owner_id == user.id).first():
        raise HTTPException(404, "Resume not found")


def get_or_create_company(db: Session, owner_id: uuid.UUID, name: str) -> models.Company:
    name = name.strip()
    company = db.query(models.Company).filter(
        models.Company.owner_id == owner_id,
        models.Company.name.ilike(name),
    ).first()
    if company:
        return company
    company = models.Company(owner_id=owner_id, name=name)
    db.add(company)
    db.flush()  # get company.id without committing yet
    return company


def _sync_tags(db: Session, application: models.Application, tags: List[str]):
    application.tags.clear()
    db.flush()
    for tag in {t.strip() for t in tags if t.strip()}:
        db.add(models.ApplicationTag(application_id=application.id, tag=tag))


@router.post("/", response_model=schemas.ApplicationOut, status_code=201)
def create_application(payload: schemas.ApplicationCreate, db: Session = Depends(get_db),
                        current_user: models.User = Depends(get_current_user)):
    if not payload.company_name.strip() or not payload.position_title.strip():
        raise HTTPException(422, "Company and position are required")
    data = payload.model_dump(exclude={"company_name", "tags"})
    _check_resume(db, current_user, payload.resume_id)
    company = get_or_create_company(db, current_user.id, payload.company_name)

    app_obj = models.Application(**data, owner_id=current_user.id, company_id=company.id)
    if app_obj.status not in NOT_SUBMITTED:
        app_obj.applied_date = datetime.utcnow()

    db.add(app_obj)
    db.flush()
    _sync_tags(db, app_obj, payload.tags)
    record_event(db, app_obj, models.EventType.CREATED, to_status=app_obj.status)
    db.commit()
    db.refresh(app_obj)
    return app_obj


@router.get("/", response_model=List[schemas.ApplicationOut])
def list_applications(
    status: Optional[models.ApplicationStatus] = None,
    search: Optional[str] = Query(None, description="Search by company name or position title"),
    min_salary: Optional[float] = None,
    location: Optional[str] = None,
    work_mode: Optional[models.WorkMode] = None,
    employment_type: Optional[models.EmploymentType] = None,
    seniority: Optional[models.SeniorityLevel] = None,
    tag: Optional[str] = None,
    resume_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = (db.query(models.Application)
         .join(models.Company)
         .options(selectinload(models.Application.company),
                  selectinload(models.Application.tags),
                  selectinload(models.Application.interviews))
         .filter(models.Application.owner_id == current_user.id))

    if status:
        q = q.filter(models.Application.status == status)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(models.Company.name.ilike(like),
                          models.Application.position_title.ilike(like)))
    if min_salary:
        q = q.filter(models.Application.salary_max >= min_salary)
    if location:
        q = q.filter(models.Application.location.ilike(f"%{location}%"))
    if work_mode:
        q = q.filter(models.Application.work_mode == work_mode)
    if employment_type:
        q = q.filter(models.Application.employment_type == employment_type)
    if seniority:
        q = q.filter(models.Application.seniority == seniority)
    if resume_id:
        q = q.filter(models.Application.resume_id == resume_id)
    if tag:
        q = q.join(models.ApplicationTag).filter(models.ApplicationTag.tag.ilike(tag))

    return q.order_by(models.Application.created_at.desc()).all()


def get_owned_application(app_id: uuid.UUID, db: Session, user: models.User) -> models.Application:
    obj = db.query(models.Application).filter(
        models.Application.id == app_id,
        models.Application.owner_id == user.id,
    ).first()
    if not obj:
        raise HTTPException(404, "Application not found")
    return obj


@router.get("/{app_id}", response_model=schemas.ApplicationOut)
def get_application(app_id: uuid.UUID, db: Session = Depends(get_db),
                     current_user: models.User = Depends(get_current_user)):
    return get_owned_application(app_id, db, current_user)


@router.get("/{app_id}/events", response_model=List[schemas.EventOut])
def list_application_events(app_id: uuid.UUID, db: Session = Depends(get_db),
                             current_user: models.User = Depends(get_current_user)):
    return get_owned_application(app_id, db, current_user).events


@router.get("/{app_id}/contacts", response_model=List[schemas.ContactOut])
def list_application_contacts(app_id: uuid.UUID, db: Session = Depends(get_db),
                               current_user: models.User = Depends(get_current_user)):
    return get_owned_application(app_id, db, current_user).contacts


@router.patch("/{app_id}", response_model=schemas.ApplicationOut)
def update_application(app_id: uuid.UUID, payload: schemas.ApplicationUpdate,
                        db: Session = Depends(get_db),
                        current_user: models.User = Depends(get_current_user)):
    obj = get_owned_application(app_id, db, current_user)
    data = payload.model_dump(exclude_unset=True, exclude={"company_name", "tags"})
    if "resume_id" in data:
        _check_resume(db, current_user, data["resume_id"])
    if data.get("position_title") is not None and not data["position_title"].strip():
        raise HTTPException(422, "Position cannot be empty")

    if payload.company_name is not None:
        if not payload.company_name.strip():
            raise HTTPException(422, "Company cannot be empty")
        company = get_or_create_company(db, current_user.id, payload.company_name)
        obj.company_id = company.id

    previous_status = obj.status
    for field, value in data.items():
        if field == "status" and value is None:
            continue
        setattr(obj, field, value)

    if obj.status != previous_status:
        if obj.status not in NOT_SUBMITTED and not obj.applied_date:
            obj.applied_date = datetime.utcnow()
        if obj.status != models.ApplicationStatus.REJECTED:
            obj.rejection_reason = None
        record_event(db, obj, models.EventType.STATUS_CHANGED,
                     from_status=previous_status, to_status=obj.status)

    if payload.tags is not None:
        _sync_tags(db, obj, payload.tags)

    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: uuid.UUID, db: Session = Depends(get_db),
                        current_user: models.User = Depends(get_current_user)):
    obj = get_owned_application(app_id, db, current_user)
    db.delete(obj)
    db.commit()


@router.post("/{app_id}/interviews", response_model=schemas.InterviewOut, status_code=201)
def add_interview(app_id: uuid.UUID, payload: schemas.InterviewCreate,
                   db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    app_obj = get_owned_application(app_id, db, current_user)
    interview = models.Interview(**payload.model_dump(), application_id=app_obj.id)
    db.add(interview)
    label = payload.interview_type or "Interview"
    record_event(db, app_obj, models.EventType.INTERVIEW_SCHEDULED,
                 description=f"{label} on {payload.scheduled_at:%b %d, %Y}")
    db.commit()
    db.refresh(interview)
    return interview
