from fastapi import APIRouter, Depends
from app.ai import AIUnavailable, ai_enabled, parse_job_with_ai
from app.job_parser import parse_job_text
from app.rate_limit import ai_rate_limit
from app import models, schemas

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/parse", response_model=schemas.JobParseOut)
def parse_job(payload: schemas.JobParseIn, user: models.User = Depends(ai_rate_limit)):
    """Extracts structured fields from a pasted job posting. Falls back to rules if AI is unavailable."""
    if payload.use_ai and ai_enabled():
        try:
            return schemas.JobParseOut(job=parse_job_with_ai(payload.text), method="ai")
        except AIUnavailable as exc:
            return schemas.JobParseOut(job=parse_job_text(payload.text), method="rules",
                                       notice=f"{exc} Used the built-in parser instead.")
    return schemas.JobParseOut(job=parse_job_text(payload.text), method="rules")
