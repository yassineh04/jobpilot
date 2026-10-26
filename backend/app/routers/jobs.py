from fastapi import APIRouter, Depends, HTTPException
from app.ai import AIUnavailable, ai_enabled, parse_job_with_ai
from app.job_import import JobImportError, import_posting
from app.job_parser import parse_job_text
from app.rate_limit import ai_rate_limit
from app import models, schemas

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _parse(text: str, use_ai: bool) -> schemas.JobParseOut:
    if use_ai and ai_enabled():
        try:
            return schemas.JobParseOut(job=parse_job_with_ai(text), method="ai")
        except AIUnavailable as exc:
            return schemas.JobParseOut(job=parse_job_text(text), method="rules",
                                       notice=f"{exc} Used the built-in parser instead.")
    return schemas.JobParseOut(job=parse_job_text(text), method="rules")


@router.post("/parse", response_model=schemas.JobParseOut)
def parse_job(payload: schemas.JobParseIn, user: models.User = Depends(ai_rate_limit)):
    """Extracts structured fields from a pasted job posting. Falls back to rules if AI is unavailable."""
    return _parse(payload.text, payload.use_ai)


@router.post("/import-url", response_model=schemas.JobImportOut)
def import_from_url(payload: schemas.JobImportIn, user: models.User = Depends(ai_rate_limit)):
    """Reads a posting from its link, then extracts the fields like a pasted posting.
    Fields the job board publishes itself (title, company, location, pay) win over the extraction."""
    try:
        posting = import_posting(payload.url)
    except JobImportError as exc:
        raise HTTPException(422, str(exc))
    result = _parse(posting.text, payload.use_ai)
    job = result.job
    job.title = posting.title or job.title
    job.company = posting.company or job.company
    job.location = posting.location or job.location
    job.work_mode = posting.work_mode or job.work_mode
    if posting.salary.get("min"):
        job.salary = schemas.SalaryRange(**posting.salary)
    return schemas.JobImportOut(**result.model_dump(), text=posting.text, url=posting.url, source=posting.source)
