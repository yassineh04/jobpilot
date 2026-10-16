from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.ai import AIUnavailable
from app.assistant import run_assistant
from app.database import get_db
from app.rate_limit import ai_rate_limit
from app import models, schemas

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/chat", response_model=schemas.AssistantOut)
def chat(payload: schemas.AssistantIn, db: Session = Depends(get_db),
         user: models.User = Depends(ai_rate_limit)):
    if payload.messages[-1].role != "user":
        raise HTTPException(422, "The last message must come from the user")
    try:
        return run_assistant(db, user, [m.model_dump() for m in payload.messages])
    except AIUnavailable as exc:
        raise HTTPException(503, str(exc))
