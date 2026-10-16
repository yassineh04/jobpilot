from collections import Counter
from statistics import median
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.skills_catalog import detect_skills, canonical_name, category_of
from app import models

router = APIRouter(prefix="/insights", tags=["insights"])

MIN_POSTINGS = 5
LABEL = ("Based on your saved job postings only. It is not representative of the overall "
         "job market.")


def _distribution(values: list[str], total: int, top: int = 8) -> list[dict]:
    counter = Counter(v for v in values if v)
    return [{"label": label, "count": count, "percent": round(count / total * 100, 1)}
            for label, count in counter.most_common(top)] if total else []


@router.get("/market")
def market_insights(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    apps = (db.query(models.Application)
            .filter(models.Application.owner_id == user.id).all())
    with_description = [a for a in apps if a.job_description and a.job_description.strip()]
    profile_skills = {(canonical_name(s.name) or s.name).lower()
                      for s in db.query(models.Skill).filter(models.Skill.owner_id == user.id)}

    skill_counts: Counter = Counter()
    for app_obj in with_description:
        skill_counts.update(set(detect_skills(f"{app_obj.job_description} {app_obj.position_title}")))

    n_desc = len(with_description)
    skills = [{
        "skill": skill,
        "category": category_of(skill),
        "count": count,
        "percent": round(count / n_desc * 100, 1),
        "in_profile": skill.lower() in profile_skills,
    } for skill, count in skill_counts.most_common(20)]

    salaries_by_currency: dict[str, list[float]] = {}
    for a in apps:
        midpoint = ((a.salary_min or a.salary_max or 0) + (a.salary_max or a.salary_min or 0)) / 2
        if midpoint:
            salaries_by_currency.setdefault(a.currency or "CAD", []).append(midpoint)
    salary = [{"currency": cur, "postings": len(vals), "median_midpoint": round(median(vals)),
               "min": round(min(vals)), "max": round(max(vals))}
              for cur, vals in sorted(salaries_by_currency.items(), key=lambda kv: -len(kv[1]))]

    total = len(apps)
    return {
        "total_postings": total,
        "postings_with_description": n_desc,
        "limited_data": n_desc < MIN_POSTINGS,
        "min_sample": MIN_POSTINGS,
        "skills": skills,
        "skill_gaps": [s for s in skills if not s["in_profile"] and s["count"] >= 2][:8],
        "locations": _distribution([a.location for a in apps], total),
        "work_modes": _distribution([a.work_mode.value for a in apps if a.work_mode], total),
        "seniority": _distribution([a.seniority.value for a in apps if a.seniority], total),
        "employment_types": _distribution([a.employment_type.value for a in apps if a.employment_type], total),
        "roles": _distribution([a.position_title for a in apps], total),
        "salary": salary,
        "label": LABEL,
    }
