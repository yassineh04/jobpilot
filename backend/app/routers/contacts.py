import uuid
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.dependencies import get_current_user
from app.events import record_event
from app.routers.applications import get_or_create_company
from app import models, schemas

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _get_owned(db: Session, contact_id: uuid.UUID, user: models.User) -> models.Contact:
    obj = db.query(models.Contact).filter(
        models.Contact.id == contact_id, models.Contact.owner_id == user.id).first()
    if not obj:
        raise HTTPException(404, "Contact not found")
    return obj


def _owned_applications(db: Session, user: models.User, ids: List[uuid.UUID]):
    if not ids:
        return []
    apps = db.query(models.Application).filter(
        models.Application.id.in_(ids), models.Application.owner_id == user.id).all()
    if len(apps) != len(set(ids)):
        raise HTTPException(404, "Application not found")
    return apps


def _apply(db: Session, user: models.User, contact: models.Contact, payload: schemas.ContactIn):
    data = payload.model_dump(exclude={"company_name", "application_ids"})
    for field, value in data.items():
        setattr(contact, field, value)
    contact.company_id = (get_or_create_company(db, user.id, payload.company_name).id
                          if payload.company_name else None)

    new_apps = _owned_applications(db, user, payload.application_ids)
    previous_ids = {a.id for a in contact.applications}
    for app_obj in new_apps:
        if app_obj.id not in previous_ids:
            record_event(db, app_obj, models.EventType.CONTACT_LINKED,
                         description=f"Contact linked: {contact.name}")
    contact.applications = new_apps


@router.get("/", response_model=List[schemas.ContactOut])
def list_contacts(
    search: Optional[str] = None,
    company_id: Optional[uuid.UUID] = None,
    follow_up_due: bool = Query(False, description="Only contacts with a follow-up due today or earlier"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = (db.query(models.Contact)
         .options(selectinload(models.Contact.company),
                  selectinload(models.Contact.applications).selectinload(models.Application.company))
         .outerjoin(models.Company, models.Contact.company_id == models.Company.id)
         .filter(models.Contact.owner_id == user.id))
    if search:
        like = f"%{search}%"
        q = q.filter(or_(models.Contact.name.ilike(like), models.Contact.role.ilike(like),
                         models.Company.name.ilike(like), models.Contact.notes.ilike(like)))
    if company_id:
        q = q.filter(models.Contact.company_id == company_id)
    if follow_up_due:
        q = q.filter(models.Contact.next_follow_up_at <= date.today())
    return q.order_by(models.Contact.next_follow_up_at.asc().nulls_last(),
                      models.Contact.name.asc()).all()


@router.post("/", response_model=schemas.ContactOut, status_code=201)
def create_contact(payload: schemas.ContactIn, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_user)):
    contact = models.Contact(owner_id=user.id, name=payload.name)
    db.add(contact)
    db.flush()
    _apply(db, user, contact, payload)
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/{contact_id}", response_model=schemas.ContactOut)
def get_contact(contact_id: uuid.UUID, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    return _get_owned(db, contact_id, user)


@router.put("/{contact_id}", response_model=schemas.ContactOut)
def update_contact(contact_id: uuid.UUID, payload: schemas.ContactIn,
                    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    contact = _get_owned(db, contact_id, user)
    _apply(db, user, contact, payload)
    db.commit()
    db.refresh(contact)
    return contact


@router.post("/{contact_id}/interactions", response_model=schemas.ContactOut)
def log_interaction(contact_id: uuid.UUID, db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_user)):
    """Marks today as the last interaction and clears a follow-up that was due."""
    contact = _get_owned(db, contact_id, user)
    contact.last_interaction_at = date.today()
    if contact.next_follow_up_at and contact.next_follow_up_at <= date.today():
        contact.next_follow_up_at = None
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: uuid.UUID, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_user)):
    db.delete(_get_owned(db, contact_id, user))
    db.commit()
