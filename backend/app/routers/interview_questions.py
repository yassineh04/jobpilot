import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas
from app.interview_intel import build_weakness_map

router = APIRouter(prefix="/interview-questions", tags=["interview-questions"])

DEFAULT_TOPICS = [
    "Algorithms", "Data Structures", "Python", "Java", "JavaScript", "SQL",
    "Databases", "Networking", "System Design", "Behavioral", "Cloud", "DevOps",
]


def _ensure_default_topics(db: Session, user: models.User):
    has_any = db.query(models.QuestionTopic.id).filter(
        models.QuestionTopic.owner_id == user.id).first()
    if has_any:
        return
    for name in DEFAULT_TOPICS:
        db.add(models.QuestionTopic(owner_id=user.id, name=name))
    db.commit()


def _validate_refs(db: Session, user: models.User, application_id=None,
                    interview_id=None, topic_id=None):
    """Every referenced object must belong to the current user."""
    if application_id and not db.query(models.Application.id).filter(
            models.Application.id == application_id,
            models.Application.owner_id == user.id).first():
        raise HTTPException(404, "Application not found")
    if interview_id and not (db.query(models.Interview.id)
                              .join(models.Application)
                              .filter(models.Interview.id == interview_id,
                                      models.Application.owner_id == user.id).first()):
        raise HTTPException(404, "Interview not found")
    if topic_id and not db.query(models.QuestionTopic.id).filter(
            models.QuestionTopic.id == topic_id,
            models.QuestionTopic.owner_id == user.id).first():
        raise HTTPException(404, "Topic not found")


def _get_owned_question(db: Session, question_id: uuid.UUID, user: models.User):
    obj = db.query(models.InterviewQuestion).filter(
        models.InterviewQuestion.id == question_id,
        models.InterviewQuestion.owner_id == user.id).first()
    if not obj:
        raise HTTPException(404, "Question not found")
    return obj


# ---------- Topics ----------
@router.get("/topics", response_model=List[schemas.TopicOut])
def list_topics(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _ensure_default_topics(db, user)
    return (db.query(models.QuestionTopic)
            .filter(models.QuestionTopic.owner_id == user.id)
            .order_by(models.QuestionTopic.name.asc()).all())


@router.post("/topics", response_model=schemas.TopicOut, status_code=201)
def create_topic(payload: schemas.TopicIn, db: Session = Depends(get_db),
                  user: models.User = Depends(get_current_user)):
    name = payload.name.strip()
    exists = db.query(models.QuestionTopic.id).filter(
        models.QuestionTopic.owner_id == user.id,
        models.QuestionTopic.name.ilike(name)).first()
    if exists:
        raise HTTPException(400, "This topic already exists.")
    topic = models.QuestionTopic(owner_id=user.id, name=name)
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/topics/{topic_id}", status_code=204)
def delete_topic(topic_id: uuid.UUID, db: Session = Depends(get_db),
                  user: models.User = Depends(get_current_user)):
    topic = db.query(models.QuestionTopic).filter(
        models.QuestionTopic.id == topic_id,
        models.QuestionTopic.owner_id == user.id).first()
    if not topic:
        raise HTTPException(404, "Topic not found")
    db.delete(topic)
    db.commit()


# ---------- Weakness map ----------
@router.get("/weakness-map")
def weakness_map(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = (db.query(models.InterviewQuestion.confidence,
                     models.InterviewQuestion.asked_date,
                     models.InterviewQuestion.created_at,
                     models.QuestionTopic.name)
            .outerjoin(models.QuestionTopic,
                       models.InterviewQuestion.topic_id == models.QuestionTopic.id)
            .filter(models.InterviewQuestion.owner_id == user.id)
            .all())

    data = [{
        "topic": r.name or "Uncategorized",
        "confidence": r.confidence,
        "when": r.asked_date or (r.created_at.date() if r.created_at else None),
    } for r in rows]
    data = [d for d in data if d["when"] is not None]
    return build_weakness_map(data)


# ---------- Questions CRUD ----------
@router.get("/", response_model=List[schemas.QuestionOut])
def list_questions(
    search: Optional[str] = None,
    topic_id: Optional[uuid.UUID] = None,
    interview_type: Optional[str] = None,
    company: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = (db.query(models.InterviewQuestion)
         .options(joinedload(models.InterviewQuestion.topic))
         .filter(models.InterviewQuestion.owner_id == user.id))
    if search:
        q = q.filter(models.InterviewQuestion.question.ilike(f"%{search}%"))
    if topic_id:
        q = q.filter(models.InterviewQuestion.topic_id == topic_id)
    if interview_type:
        q = q.filter(models.InterviewQuestion.interview_type == interview_type)
    if company:
        q = q.filter(models.InterviewQuestion.company.ilike(f"%{company}%"))
    return (q.order_by(models.InterviewQuestion.created_at.desc())
            .offset(offset).limit(limit).all())


@router.post("/", response_model=schemas.QuestionOut, status_code=201)
def create_question(payload: schemas.QuestionIn, db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_user)):
    _validate_refs(db, user, payload.application_id, payload.interview_id, payload.topic_id)
    obj = models.InterviewQuestion(**payload.model_dump(), owner_id=user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/{question_id}", response_model=schemas.QuestionOut)
def update_question(question_id: uuid.UUID, payload: schemas.QuestionUpdate,
                     db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_user)):
    obj = _get_owned_question(db, question_id, user)
    data = payload.model_dump(exclude_unset=True)
    _validate_refs(db, user, data.get("application_id"), data.get("interview_id"),
                    data.get("topic_id"))
    for field, value in data.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{question_id}", status_code=204)
def delete_question(question_id: uuid.UUID, db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_user)):
    obj = _get_owned_question(db, question_id, user)
    db.delete(obj)
    db.commit()