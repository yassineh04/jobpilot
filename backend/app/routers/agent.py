from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.agent import execute_action, run_agent
from app.ai import AIUnavailable
from app.database import get_db
from app.dependencies import get_current_user
from app.rate_limit import ai_rate_limit
from app import models, schemas

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=schemas.AgentOut)
def chat(payload: schemas.AgentIn, db: Session = Depends(get_db),
         user: models.User = Depends(ai_rate_limit)):
    if payload.messages[-1].role != "user":
        raise HTTPException(422, "The last message must come from the user")
    try:
        return run_agent(db, user, [m.model_dump() for m in payload.messages], payload.context)
    except AIUnavailable as exc:
        raise HTTPException(503, str(exc))


@router.post("/actions", response_model=schemas.AgentActionOut)
def confirm_action(payload: schemas.AgentActionIn, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    """Runs a change the agent proposed, once the user has confirmed it (no AI involved)."""
    return execute_action(db, user, payload)
