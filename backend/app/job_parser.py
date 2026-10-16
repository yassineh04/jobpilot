"""Deterministic job-posting parser. Extracts only what is explicitly present in the text."""
import re
from typing import Optional
from app import models
from app.schemas import ParsedJob, SalaryRange
from app.skills_catalog import LANGUAGES, detect_skills

PREFERRED_HEADINGS = re.compile(
    r"^\s*(nice[\s-]to[\s-]have|preferred|bonus|assets?|pluses?|good to have)\b", re.IGNORECASE)
REQUIRED_HEADINGS = re.compile(
    r"^\s*(requirements?|qualifications?|must[\s-]have|what you('ll)? bring|required|you have)\b",
    re.IGNORECASE)
RESPONSIBILITY_HEADINGS = re.compile(
    r"^\s*(responsibilities|what you('ll)? do|the role|your role|duties|in this role)\b", re.IGNORECASE)
BENEFIT_HEADINGS = re.compile(r"^\s*(benefits|perks|what we offer|why join)\b", re.IGNORECASE)
BULLET = re.compile(r"^\s*(?:[-•*·▪●◦]|\d+[.)])\s+(.*\S)")

SENIORITY_KEYWORDS = [
    (r"\b(intern|internship|co-?op)\b", models.SeniorityLevel.INTERN),
    (r"\bprincipal\b", models.SeniorityLevel.PRINCIPAL),
    (r"\bstaff\b", models.SeniorityLevel.STAFF),
    (r"\b(lead|tech lead)\b", models.SeniorityLevel.LEAD),
    (r"\b(senior|sr\.?)\b", models.SeniorityLevel.SENIOR),
    (r"\b(junior|jr\.?|entry[\s-]level|new grad(uate)?)\b", models.SeniorityLevel.JUNIOR),
    (r"\b(intermediate|mid[\s-]level)\b", models.SeniorityLevel.MID),
]

EMPLOYMENT_KEYWORDS = [
    (r"\b(internship|intern|co-?op)\b", models.EmploymentType.INTERNSHIP),
    (r"\bpart[\s-]time\b", models.EmploymentType.PART_TIME),
    (r"\b(contract|contractor|fixed[\s-]term)\b", models.EmploymentType.CONTRACT),
    (r"\bfreelance\b", models.EmploymentType.FREELANCE),
    (r"\b(full[\s-]time|permanent)\b", models.EmploymentType.FULL_TIME),
]

CURRENCY_SYMBOLS = {"$": None, "€": "EUR", "£": "GBP"}
SALARY_RANGE = re.compile(
    r"(?P<cur1>CAD|USD|EUR|GBP|CHF|\$|€|£)?\s?(?P<min>\d{2,3}(?:[,\s]?\d{3})|\d{2,3}\s?[kK])"
    r"\s*(?:-|–|—|to)\s*"
    r"(?P<cur2>CAD|USD|EUR|GBP|CHF|\$|€|£)?\s?(?P<max>\d{2,3}(?:[,\s]?\d{3})|\d{2,3}\s?[kK])"
    r"\s*(?P<cur3>CAD|USD|EUR|GBP|CHF)?")


def _amount(raw: str) -> float:
    raw = raw.replace(",", "").replace(" ", "")
    if raw.lower().endswith("k"):
        return float(raw[:-1]) * 1000
    return float(raw)


def parse_salary(text: str) -> SalaryRange:
    for match in SALARY_RANGE.finditer(text):
        low, high = _amount(match["min"]), _amount(match["max"])
        # Ignore ranges that are clearly not yearly/hourly salaries (e.g. "2019-2023")
        if low < 15 or high < low or (1900 <= low <= 2100 and 1900 <= high <= 2100):
            continue
        if low < 1000 and "k" not in match["min"].lower():
            continue
        codes = [match[g] for g in ("cur1", "cur2", "cur3") if match[g]]
        currency = None
        for code in codes:
            currency = CURRENCY_SYMBOLS.get(code, code) or currency
        if currency is None and ("CAD" in text or "Canada" in text):
            currency = "CAD"
        return SalaryRange(min=low, max=high, currency=currency)
    return SalaryRange()


def _first(patterns, text: str):
    for pattern, value in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return value
    return None


def _work_mode(text: str) -> Optional[models.WorkMode]:
    if re.search(r"\bhybrid\b", text, re.IGNORECASE):
        return models.WorkMode.HYBRID
    if re.search(r"\b(fully remote|remote[\s-]first|100% remote|remote)\b", text, re.IGNORECASE):
        return models.WorkMode.REMOTE
    if re.search(r"\b(on[\s-]site|in[\s-]office|onsite)\b", text, re.IGNORECASE):
        return models.WorkMode.ON_SITE
    return None


def _labelled_value(label: str, text: str) -> Optional[str]:
    match = re.search(rf"^\s*{label}\s*[:\-–]\s*(.+)$", text, re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip()[:120] if match else None


def _sections(lines: list[str]) -> dict[str, list[str]]:
    """Groups bullet lines under the most recent recognised heading."""
    sections: dict[str, list[str]] = {"required": [], "preferred": [], "responsibilities": [],
                                      "benefits": [], "other": []}
    current = "other"
    for line in lines:
        if PREFERRED_HEADINGS.match(line):
            current = "preferred"
        elif REQUIRED_HEADINGS.match(line):
            current = "required"
        elif RESPONSIBILITY_HEADINGS.match(line):
            current = "responsibilities"
        elif BENEFIT_HEADINGS.match(line):
            current = "benefits"
        bullet = BULLET.match(line)
        if bullet:
            sections[current].append(bullet.group(1).strip())
    return sections


def _title(lines: list[str]) -> Optional[str]:
    labelled = _labelled_value("(job title|title|position|role)", "\n".join(lines))
    if labelled:
        return labelled
    for line in lines[:3]:
        candidate = line.strip()
        if 3 < len(candidate) <= 80 and not candidate.endswith(".") and not BULLET.match(candidate):
            return candidate
    return None


def parse_job_text(text: str) -> ParsedJob:
    lines = [line for line in text.splitlines() if line.strip()]
    sections = _sections(lines)

    # A skill is "preferred" only if it never appears outside the nice-to-have section
    preferred_lines = set(sections["preferred"])
    outside_preferred = "\n".join(
        line for line in lines
        if not (BULLET.match(line) and BULLET.match(line).group(1).strip() in preferred_lines))
    required = detect_skills(outside_preferred)
    preferred = [s for s in detect_skills("\n".join(preferred_lines)) if s not in required]

    sentences = [BULLET.sub(r"\1", s).strip()
                 for s in re.split(r"(?<=[.!?])\s+|\n", text)]
    experience = [s.strip() for s in sentences
                  if re.search(r"\b\d+\+?\s*(?:-\s*\d+\s*)?years?\b", s, re.IGNORECASE)][:5]
    education = [s.strip() for s in sentences
                 if re.search(r"\b(bachelor|master|ph\.?d|degree|diploma|b\.?sc|m\.?sc)\b", s, re.IGNORECASE)][:4]
    certifications = [s.strip() for s in sentences if re.search(r"\bcertifi", s, re.IGNORECASE)][:4]
    languages = [lang for lang in LANGUAGES if re.search(rf"\b{lang}\b", text)]

    return ParsedJob(
        title=_title(lines),
        company=_labelled_value("company", text),
        location=_labelled_value("location", text),
        work_mode=_work_mode(text),
        employment_type=_first(EMPLOYMENT_KEYWORDS, text),
        seniority=_first(SENIORITY_KEYWORDS, "\n".join(lines[:3])) or _first(SENIORITY_KEYWORDS, text),
        salary=parse_salary(text),
        required_skills=required,
        preferred_skills=preferred,
        education_requirements=education,
        experience_requirements=experience,
        languages=languages,
        certifications=certifications,
        responsibilities=sections["responsibilities"][:10],
        benefits=sections["benefits"][:10],
    )
