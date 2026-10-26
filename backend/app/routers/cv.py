import re
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from app.cv_import import CVError, extract_pdf_text, import_items, mark_existing, parse_cv
from app.database import get_db
from app.dependencies import get_current_user
from app.rate_limit import ai_rate_limit
from app.routers.resumes import _count, _out, attach_pdf, read_upload
from app import models, schemas

router = APIRouter(prefix="/profile/cv", tags=["profile"])


def resume_name(file_name: str | None) -> str:
    """"jordan-tremblay-cv.pdf" -> "Jordan Tremblay CV". Words with capitals are kept as written."""
    stem = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", Path(file_name or "").name)  # ".pdf" alone has no stem
    words = [w for w in re.split(r"[\s_.-]+", stem) if w]
    words = ["CV" if w.lower() == "cv" else w if any(c.isupper() for c in w) else w.capitalize() for w in words]
    return " ".join(words)[:120] or "Resume"


@router.post("/parse", response_model=schemas.CVParseOut)
def parse(file: UploadFile = File(...), save_as_resume: bool = Form(True),
          db: Session = Depends(get_db), user: models.User = Depends(ai_rate_limit)):
    """Reads a CV and returns what it contains, for review. Only the resume file is saved here."""
    data = read_upload(file)
    try:
        text, pages = extract_pdf_text(data)
    except CVError as exc:
        raise HTTPException(422, str(exc))

    resume = None
    if save_as_resume:
        # Uploading the same file again updates its resume instead of adding a copy
        resume = db.query(models.Resume).filter(
            models.Resume.owner_id == user.id, models.Resume.file_name == file.filename,
            models.Resume.file_size == len(data)).first()
        if resume is None:
            resume = models.Resume(owner_id=user.id, name=resume_name(file.filename))
            db.add(resume)
        attach_pdf(resume, file.filename, data)
        db.commit()
        db.refresh(resume)

    items, method, notice, removed = parse_cv(text)
    return schemas.CVParseOut(method=method, notice=notice, pages=pages, removed=removed,
                              resume=_out(resume, _count(db, resume.id)) if resume else None,
                              **mark_existing(db, user, items))


@router.post("/import", response_model=schemas.CVImportOut)
def import_reviewed(payload: schemas.CVImportIn, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_user)):
    """Saves the items the user kept on the review screen. Duplicates are skipped."""
    return import_items(db, user, payload)
