from collections import Counter, defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas

router = APIRouter(
    prefix="/stats",
    tags=["stats"]
)

@router.get("/", response_model=schemas.StatsOut)
def get_stats(db: Session = Depends(get_db),
              current_user: models.User = Depends(get_current_user)):
    apps = db.query(models.Application).filter(
        models.Application.owner_id == current_user.id).all()

    PROGRESSED_STATUSES = {
        models.ApplicationStatus.RECRUITER_CONTACT,
        models.ApplicationStatus.ASSESSMENT,
        models.ApplicationStatus.INTERVIEW,
        models.ApplicationStatus.FINAL_INTERVIEW,
        models.ApplicationStatus.OFFER,
    }

    total = len(apps)
    by_status = Counter(a.status.value for a in apps)

    interview_or_more = sum(1 for a in apps if a.status in PROGRESSED_STATUSES)
    offers = by_status.get("OFFER", 0)

    salaries_min = [a.salary_min for a in apps if a.salary_min]
    salaries_max = [a.salary_max for a in apps if a.salary_max]

    per_month = defaultdict(int)
    for a in apps:
        # Saved/Preparing applications have no applied_date yet
        key = (a.applied_date or a.date_saved or a.created_at).strftime("%Y-%m")
        per_month[key] += 1

    return schemas.StatsOut(
        total=total,
        by_status=dict(by_status),
        conversion_rate_interview=round(interview_or_more / total * 100, 1) if total else 0,
        conversion_rate_offer=round(offers / total * 100, 1) if total else 0,
        avg_salary_min=round(sum(salaries_min) / len(salaries_min), 2) if salaries_min else None,
        avg_salary_max=round(sum(salaries_max) / len(salaries_max), 2) if salaries_max else None,
        applications_per_month=dict(sorted(per_month.items())),
    )