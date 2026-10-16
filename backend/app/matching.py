import re
from datetime import date
from typing import Optional
from app import models
from app.skills_catalog import detect_skills, canonical_name


SENIORITY_MIN_YEARS = {
    models.SeniorityLevel.INTERN: 0,
    models.SeniorityLevel.JUNIOR: 0,
    models.SeniorityLevel.MID: 2,
    models.SeniorityLevel.SENIOR: 5,
    models.SeniorityLevel.LEAD: 8,
    models.SeniorityLevel.STAFF: 12,
    models.SeniorityLevel.PRINCIPAL: 16,
}

DEGREE_KEYWORDS = ["bachelor", "master", "phd", "ph.d", "degree", "bsc", "msc"]

WEIGHTS = {"technical": 40, "experience": 20, "education": 10, "location": 10, "preferences": 20}


def _word_in_text(word: str, text: str) -> bool:
    pattern = r"(?<![\w.+#])" + re.escape(word.strip()) + r"(?![\w+#])"
    return bool(re.search(pattern, text, re.IGNORECASE))


def _total_years_experience(experiences: list[models.Experience]) -> float:
    total_days = 0
    today = date.today()
    for exp in experiences:
        if not exp.start_date:
            continue
        end = exp.end_date or today
        total_days += max((end - exp.start_date).days, 0)
    return round(total_days / 365.25, 1)


def _evidence_label(ev: models.SkillEvidence) -> str:
    if ev.source_experience:
        return f"{ev.source_experience.title} at {ev.source_experience.company}"
    if ev.source_project:
        return f"Project: {ev.source_project.name}"
    if ev.source_education:
        return f"{ev.source_education.degree}, {ev.source_education.institution}"
    return ev.description


def _skill_key(name: str) -> str:
    return (canonical_name(name) or name).strip().lower()


def _technical_score(application: models.Application, skills: list[models.Skill]):
    """
    Coverage of the skills detected in the posting:
    confirmed (has evidence) = 1, probable (in profile, no evidence) = 0.5, not found = 0.
    """
    description = f"{application.job_description or ''} {application.position_title}"
    empty = {"confirmed": [], "probable": [], "not_found": [], "detected": 0}
    if not description.strip():
        return None, empty

    profile_mentioned = [s for s in skills if _word_in_text(s.name, description)]
    profile_keys = {_skill_key(s.name) for s in skills}
    # Catalog skills in the posting the profile does not list: "not found", never "lacking"
    not_found = [name for name in detect_skills(description) if _skill_key(name) not in profile_keys]

    detected = len(profile_mentioned) + len(not_found)
    if detected == 0:
        return None, empty

    confirmed = [s for s in profile_mentioned if s.evidences]
    probable = [s for s in profile_mentioned if not s.evidences]
    score = (len(confirmed) + 0.5 * len(probable)) / detected * 100
    return round(score, 1), {
        "detected": detected,
        "confirmed": [{"skill": s.name, "evidence": [_evidence_label(e) for e in s.evidences]}
                      for s in confirmed],
        "probable": [s.name for s in probable],
        "not_found": not_found,
    }


def _experience_score(application: models.Application, experiences: list[models.Experience]):
    if not application.seniority:
        return None, None, None
    candidate_years = _total_years_experience(experiences)
    required_years = SENIORITY_MIN_YEARS[application.seniority]
    if required_years == 0:
        return 100.0, candidate_years, required_years
    score = min(candidate_years / required_years, 1.0) * 100
    return round(score, 1), candidate_years, required_years


def _education_score(application: models.Application, educations: list[models.Education]):
    description = (application.job_description or "")
    requires_degree = any(_word_in_text(k, description) for k in DEGREE_KEYWORDS)
    if not requires_degree:
        return None
    return 100.0 if len(educations) > 0 else 0.0


def _location_score(application: models.Application, preference: Optional[models.CandidatePreference]):
    if not preference:
        return None
    if application.work_mode and preference.remote_preference:
        if application.work_mode == preference.remote_preference:
            return 100.0
    preferred_locations = [l.location.lower() for l in preference.locations]
    if application.location and preferred_locations:
        if any(loc in application.location.lower() or application.location.lower() in loc
               for loc in preferred_locations):
            return 100.0
        return 0.0
    if application.work_mode and preference.remote_preference:
        return 50.0 if application.work_mode == models.WorkMode.HYBRID else 0.0
    return None


def _preferences_score(application: models.Application, preference: Optional[models.CandidatePreference]):
    if not preference:
        return None

    sub_scores = []

    if application.employment_type and preference.desired_employment_type:
        sub_scores.append(100.0 if application.employment_type == preference.desired_employment_type else 0.0)

    if (application.salary_min or application.salary_max) and \
       (preference.salary_expectation_min or preference.salary_expectation_max):
        app_min = application.salary_min or 0
        app_max = application.salary_max or app_min
        pref_min = preference.salary_expectation_min or 0
        pref_max = preference.salary_expectation_max or pref_min
        overlap = max(0, min(app_max, pref_max) - max(app_min, pref_min))
        span = max(app_max, pref_max) - min(app_min, pref_min)
        sub_scores.append((overlap / span * 100) if span > 0 else 100.0)

    if not sub_scores:
        return None
    return round(sum(sub_scores) / len(sub_scores), 1)


def _constraints(application: models.Application, preference: Optional[models.CandidatePreference],
                 candidate_years, required_years) -> list[str]:
    """Factual differences between the posting and the user's stated preferences."""
    notes = []
    if preference:
        if application.work_mode and preference.remote_preference and \
                application.work_mode != preference.remote_preference:
            notes.append(f"Work mode is {application.work_mode.value.replace('_', '-').lower()}, "
                         f"you prefer {preference.remote_preference.value.replace('_', '-').lower()}.")
        if application.salary_max and preference.salary_expectation_min and \
                application.salary_max < preference.salary_expectation_min:
            notes.append(f"Posted maximum salary ({application.salary_max:,.0f}) is below your "
                         f"minimum expectation ({preference.salary_expectation_min:,.0f}).")
        if application.employment_type and preference.desired_employment_type and \
                application.employment_type != preference.desired_employment_type:
            notes.append(f"Employment type is {application.employment_type.value.replace('_', '-').lower()}.")
        locations = [l.location for l in preference.locations]
        if application.location and locations and application.work_mode != models.WorkMode.REMOTE and \
                not any(l.lower() in application.location.lower() for l in locations):
            notes.append(f"Location ({application.location}) is not in your preferred locations.")
    if required_years and candidate_years is not None and candidate_years < required_years:
        notes.append(f"{application.seniority.value.title()} roles usually ask for about {required_years}+ "
                     f"years; your recorded experience totals {candidate_years:g} year{'s' if candidate_years != 1 else ''}.")
    return notes


def compute_match(application: models.Application, skills: list[models.Skill],
                   experiences: list[models.Experience], educations: list[models.Education],
                   preference: Optional[models.CandidatePreference]) -> dict:
    """
    Deterministic, transparent compatibility score - not a prediction of any hiring outcome.
    Base weights: technical 40, experience 20, education 10, location 10, preferences 20.
    Components without enough data are excluded and their weight redistributed proportionally.
    """
    technical_score, technical_detail = _technical_score(application, skills)
    experience_score, candidate_years, required_years = _experience_score(application, experiences)
    education_score = _education_score(application, educations)
    location_score = _location_score(application, preference)
    preferences_score = _preferences_score(application, preference)

    raw_scores = {
        "technical": technical_score,
        "experience": experience_score,
        "education": education_score,
        "location": location_score,
        "preferences": preferences_score,
    }

    available = {k: v for k, v in raw_scores.items() if v is not None}
    unavailable = [k for k, v in raw_scores.items() if v is None]

    if not available:
        overall = None
    else:
        total_weight = sum(WEIGHTS[k] for k in available)
        overall = round(sum(raw_scores[k] * WEIGHTS[k] for k in available) / total_weight, 1)

    effective_weights = ({k: round(WEIGHTS[k] / sum(WEIGHTS[x] for x in available) * 100, 1)
                          for k in available} if available else {})

    return {
        "overall": overall,
        "components": {
            "technical": {"score": technical_score, "weight": WEIGHTS["technical"],
                          "effective_weight": effective_weights.get("technical"),
                          "detail": technical_detail},
            "experience": {"score": experience_score, "weight": WEIGHTS["experience"],
                           "effective_weight": effective_weights.get("experience"),
                           "detail": {"candidate_years": candidate_years,
                                      "required_years": required_years,
                                      "required_level": application.seniority.value if application.seniority else None}},
            "education": {"score": education_score, "weight": WEIGHTS["education"],
                          "effective_weight": effective_weights.get("education")},
            "location": {"score": location_score, "weight": WEIGHTS["location"],
                         "effective_weight": effective_weights.get("location")},
            "preferences": {"score": preferences_score, "weight": WEIGHTS["preferences"],
                            "effective_weight": effective_weights.get("preferences")},
        },
        "constraints": _constraints(application, preference, candidate_years, required_years),
        "unavailable_components": unavailable,
        "explanation": (
            "Compatibility between this posting and your recorded profile. It is not a prediction of "
            "any hiring outcome. Skills marked “not found” are not listed in your profile; that does "
            "not mean you lack them. "
            f"{'All components used.' if not unavailable else 'Not evaluated (missing data): ' + ', '.join(unavailable) + '.'}"
        ),
    }
