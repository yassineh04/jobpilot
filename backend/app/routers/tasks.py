import uuid
from datetime import datetime
from typing import List, Literal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _out(task: models.Task) -> schemas.TaskOut:
    return schemas.TaskOut(
        id=task.id, title=task.title, kind=task.kind, due_date=task.due_date,
        done=task.done, completed_at=task.completed_at, created_at=task.created_at,
        application_id=task.application_id, contact_id=task.contact_id,
        application=schemas.ApplicationRef.model_validate(task.application) if task.application else None,
        contact_name=task.contact.name if task.contact else None,
    )


def _validate_refs(db: Session, user: models.User, application_id, contact_id):
    if application_id and not db.query(models.Application.id).filter(
            models.Application.id == application_id,
            models.Application.owner_id == user.id).first():
        raise HTTPException(404, "Application not found")
    if contact_id and not db.query(models.Contact.id).filter(
            models.Contact.id == contact_id, models.Contact.owner_id == user.id).first():
        raise HTTPException(404, "Contact not found")


def _get_owned(db: Session, task_id: uuid.UUID, user: models.User) -> models.Task:
    task = db.query(models.Task).filter(
        models.Task.id == task_id, models.Task.owner_id == user.id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.get("/", response_model=List[schemas.TaskOut])
def list_tasks(status: Literal["open", "done", "all"] = "open",
               db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    q = (db.query(models.Task)
         .options(selectinload(models.Task.application).selectinload(models.Application.company),
                  selectinload(models.Task.contact))
         .filter(models.Task.owner_id == user.id))
    if status == "open":
        q = q.filter(models.Task.completed_at.is_(None))
    elif status == "done":
        q = q.filter(models.Task.completed_at.isnot(None))
    tasks = q.order_by(models.Task.due_date.asc().nulls_last(), models.Task.created_at.desc()).all()
    return [_out(t) for t in tasks]


@router.post("/", response_model=schemas.TaskOut, status_code=201)
def create_task(payload: schemas.TaskIn, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    _validate_refs(db, user, payload.application_id, payload.contact_id)
    task = models.Task(**payload.model_dump(), owner_id=user.id)
    task.title = task.title.strip()
    db.add(task)
    db.commit()
    db.refresh(task)
    return _out(task)


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: uuid.UUID, payload: schemas.TaskUpdate,
                 db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    task = _get_owned(db, task_id, user)
    data = payload.model_dump(exclude_unset=True)
    _validate_refs(db, user, data.get("application_id"), data.get("contact_id"))
    done = data.pop("done", None)
    for field, value in data.items():
        setattr(task, field, value)
    if done is True and task.completed_at is None:
        task.completed_at = datetime.utcnow()
    elif done is False:
        task.completed_at = None
    db.commit()
    db.refresh(task)
    return _out(task)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: uuid.UUID, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    db.delete(_get_owned(db, task_id, user))
    db.commit()
