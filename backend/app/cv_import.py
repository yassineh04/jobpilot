"""Reads a CV (PDF) into profile items: experiences, education, projects, skills and languages.

The text is extracted here with pypdf; the model only structures it. Each item is then checked
against that text: a role is kept if its company or title appears in the CV, a bullet if its words
do, a skill if it is mentioned. Nothing is saved until the user reviews the result.
"""
import io
import logging
import re
from datetime import date
from typing import Any, Optional
from pydantic import BaseModel, field_validator
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy.orm import Session
from app import models
from app.ai import AIUnavailable, ai_enabled, require_llm
from app.ai_schemas import _Lenient, _clean_str
from app.grounding import normalize
from app.skills_catalog import category_of, detect_skills, mentioned_in

logger = logging.getLogger(__name__)
MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_PAGES = 8
MAX_TEXT_CHARS = 15000


class CVError(Exception):
    """The file cannot be used; the message is shown to the user as is."""


# ---------- PDF -> text ----------
_BULLET_GLYPHS = re.compile(r"[▪●◦•‣⁃∙]")


def tidy_text(text: str) -> str:
    text = _BULLET_GLYPHS.sub("•", text.replace("\r", ""))
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # words hyphenated across lines
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def extract_pdf_text(data: bytes) -> tuple[str, int]:
    """Returns (text, page count) or raises CVError with a message for the user."""
    if len(data) > MAX_PDF_BYTES:
        raise CVError("This file is larger than 5 MB.")
    if not data.lstrip()[:5].startswith(b"%PDF"):
        raise CVError("This file is not a PDF. Export your CV as PDF and try again.")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise CVError("This PDF is password-protected. Remove the password and try again.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:MAX_PAGES])
        pages = len(reader.pages)
    except CVError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError) as exc:
        logger.info("Unreadable PDF: %s", exc)
        raise CVError("This PDF could not be read. Try exporting it again from your editor.")
    text = tidy_text(text)
    if len(text) < 150:
        raise CVError("No text was found in this PDF. It is probably a scanned image: "
                      "export your CV from Word, Google Docs or LaTeX instead.")
    return text, pages


# ---------- Shapes the model returns ----------
class _Item(_Lenient):
    @field_validator("*", mode="before")
    @classmethod
    def _none_to_empty(cls, value, info):
        field = cls.model_fields[info.field_name]
        return "" if value is None and field.annotation is str else value


class CVExperience(_Item):
    title: str = ""
    company: str = ""
    location: str = ""
    start: str = ""
    end: str = ""
    bullets: list[str] = []


class CVEducation(_Item):
    institution: str = ""
    degree: str = ""
    field: str = ""
    start: str = ""
    end: str = ""
    gpa: Optional[float] = None

    @field_validator("gpa", mode="before")
    @classmethod
    def _gpa(cls, value):
        try:
            return float(str(value).split("/")[0].replace(",", ".")) if value not in (None, "") else None
        except ValueError:
            return None


class CVProject(_Item):
    name: str = ""
    description: str = ""
    url: str = ""


class CVLanguage(_Item):
    language: str = ""
    level: str = ""


class ParsedCV(_Item):
    full_name: str = ""
    headline: str = ""
    experiences: list[CVExperience] = []
    education: list[CVEducation] = []
    projects: list[CVProject] = []
    skills: list[str] = []
    languages: list[CVLanguage] = []


CV_SYSTEM = """You turn the text of a CV into JSON. Reply with ONE JSON object only.
- Copy facts exactly as written in the CV. Never invent or improve anything.
- Bullets: copy each achievement line word for word (drop only the bullet symbol).
- Dates: "YYYY-MM", or "YYYY" when the month is not given, or "present" for a current role.
- skills: short names of technologies, tools and methods the CV lists or mentions (e.g. "Python", "Docker").
- languages: spoken languages only, with the level word as written (e.g. "Native", "Bilingue").
- Leave a field empty ("" or []) when the CV does not say it. The CV may be in French or English."""

CV_SHAPE = """{
  "full_name": string, "headline": string,
  "experiences": [{"title": string, "company": string, "location": string, "start": string, "end": string,
                   "bullets": [string]}],
  "education": [{"institution": string, "degree": string, "field": string, "start": string, "end": string,
                 "gpa": number|null}],
  "projects": [{"name": string, "description": string, "url": string}],
  "skills": [string],
  "languages": [{"language": string, "level": string}]
}"""


# ---------- Normalization ----------
MONTHS = {
    "jan": 1, "janv": 1, "january": 1, "janvier": 1, "feb": 2, "fev": 2, "february": 2, "fevrier": 2,
    "mar": 3, "march": 3, "mars": 3, "apr": 4, "avr": 4, "april": 4, "avril": 4, "may": 5, "mai": 5,
    "jun": 6, "june": 6, "juin": 6, "jul": 7, "juil": 7, "july": 7, "juillet": 7, "aug": 8, "aout": 8,
    "august": 8, "sep": 9, "sept": 9, "september": 9, "septembre": 9, "oct": 10, "october": 10,
    "octobre": 10, "nov": 11, "november": 11, "novembre": 11, "dec": 12, "december": 12, "decembre": 12,
}
PRESENT = {"present", "current", "now", "today", "ongoing", "aujourd hui", "actuel", "actuellement",
           "en cours", "maintenant"}


def parse_month(value: str) -> tuple[Optional[date], bool]:
    """'2023-05', 'May 2023', 'mai 2023', '05/2023', '2023' -> (date, is_present)."""
    text = normalize(value)
    if not text:
        return None, False
    if text in PRESENT:
        return None, True
    year = re.search(r"\b(19[5-9]\d|20\d\d|2100)\b", text)
    if not year:
        return None, False
    if m := re.search(r"\b(?:19|20)\d\d (\d{1,2})\b", text) or re.search(r"\b(\d{1,2}) (?:19|20)\d\d\b", text):
        month = int(m.group(1))  # 2023-05, 05/2023
    else:
        month = next((MONTHS[w] for w in text.split() if w in MONTHS), 1)  # May 2023, mai 2023
    month = month if 1 <= month <= 12 else 1
    return date(int(year.group(1)), month, 1), False


LANGUAGE_NAMES = {
    "English": ["english", "anglais", "ingles"], "French": ["french", "francais", "frances"],
    "Spanish": ["spanish", "espagnol", "espanol"], "German": ["german", "allemand", "deutsch"],
    "Arabic": ["arabic", "arabe"], "Mandarin": ["mandarin", "chinese", "chinois"],
    "Portuguese": ["portuguese", "portugais"], "Italian": ["italian", "italien"],
    "Japanese": ["japanese", "japonais"], "Hindi": ["hindi"], "Russian": ["russian", "russe"],
    "Korean": ["korean", "coreen"], "Dutch": ["dutch", "neerlandais"], "Turkish": ["turkish", "turc"],
}
LEVELS = [  # (words, proficiency), checked in order
    (("native", "mother tongue", "maternelle", "natif", "native"), models.LanguageProficiency.NATIVE),
    (("fluent", "bilingual", "bilingue", "courant", "fluent", "professional", "professionnel", "advanced",
      "avance", "c1", "c2"), models.LanguageProficiency.FLUENT),
    (("intermediate", "intermediaire", "conversational", "b1", "b2", "working"), models.LanguageProficiency.CONVERSATIONAL),
    (("basic", "beginner", "notions", "debutant", "elementary", "a1", "a2", "scolaire"), models.LanguageProficiency.BASIC),
]


def canonical_language(name: str) -> Optional[str]:
    needle = normalize(name)
    return next((lang for lang, names in LANGUAGE_NAMES.items() if needle in names), None)


def language_level(level: str) -> models.LanguageProficiency:
    text = normalize(level)
    for words, proficiency in LEVELS:
        if any(re.search(rf"\b{w}\b", text) for w in words):
            return proficiency
    return models.LanguageProficiency.FLUENT


# ---------- Verification against the CV text ----------
def in_text(phrase: str, text_norm: str) -> bool:
    needle = normalize(phrase)
    return len(needle) >= 2 and f" {needle} " in f" {text_norm} "


def _shingles(words: list[str]) -> set[tuple[str, ...]]:
    return {tuple(words[i:i + 3]) for i in range(len(words) - 2)}


def mostly_in_text(sentence: str, text_norm: str, ratio: float = 0.7) -> bool:
    """True if the sentence was copied from the CV, tolerating line breaks and small edits."""
    if in_text(sentence, text_norm):
        return True
    words = normalize(sentence).split()
    if len(words) < 3:
        return False
    source = _shingles(text_norm.split())
    own = _shingles(words)
    return len(own & source) / len(own) >= ratio


def _bullets(lines: list[str], text_norm: str) -> tuple[list[str], int]:
    kept = [b.strip(" -•*·–") for b in lines if b and mostly_in_text(b, text_norm)]
    return [b for b in kept if b][:12], len(lines) - len(kept)


def verify(cv: ParsedCV, text: str) -> tuple[dict, int]:
    """Items backed by the CV text, in the shape the import screen uses, and how many were dropped."""
    text_norm = normalize(text)
    removed = 0
    result: dict[str, Any] = {"full_name": cv.full_name if in_text(cv.full_name, text_norm) else "",
                              "headline": cv.headline[:200] if mostly_in_text(cv.headline, text_norm, 0.5) else "",
                              "experiences": [], "education": [], "projects": [], "skills": [], "languages": []}

    for exp in cv.experiences[:15]:
        if not exp.title or not exp.company or not (in_text(exp.company, text_norm) or in_text(exp.title, text_norm)):
            removed += 1
            continue
        bullets, dropped = _bullets(exp.bullets, text_norm)
        removed += dropped
        start, _ = parse_month(exp.start)
        end, present = parse_month(exp.end)
        result["experiences"].append({
            "title": exp.title[:200], "company": exp.company[:200], "location": exp.location[:120] or None,
            "start_date": start, "end_date": None if present else end, "current": present or not exp.end,
            "achievements": "\n".join(f"- {b}" for b in bullets) or None,
        })

    for edu in cv.education[:10]:
        if not edu.institution or not in_text(edu.institution, text_norm):
            removed += 1
            continue
        start, _ = parse_month(edu.start)
        end, _ = parse_month(edu.end)
        result["education"].append({
            "institution": edu.institution[:200], "degree": (edu.degree or "Program")[:200],
            "field": edu.field[:200] or None, "start_date": start, "end_date": end,
            "gpa": edu.gpa if edu.gpa is not None and 0 < edu.gpa <= 100 else None,
        })

    for project in cv.projects[:12]:
        if not project.name or not in_text(project.name, text_norm):
            removed += 1
            continue
        description = project.description if mostly_in_text(project.description, text_norm, 0.5) else ""
        url = project.url if project.url and normalize(project.url) in text_norm else ""
        result["projects"].append({"name": project.name[:200], "description": description[:1000] or None,
                                   "repository_url": url or None})

    seen: set[str] = set()
    for skill in [*cv.skills, *detect_skills(text)]:
        name = _clean_str(skill, 60)
        if not name or name.lower() in seen or len(seen) >= 60:
            continue
        if mentioned_in(name, text):
            seen.add(name.lower())
            result["skills"].append({"name": name, "category": category_of(name)})
        elif skill in cv.skills:
            removed += 1

    result["languages"] = _languages(cv.languages, text_norm)
    return result, removed


def _languages(found: list[CVLanguage], text_norm: str) -> list[dict]:
    out: dict[str, models.LanguageProficiency] = {}
    for item in found:
        name = canonical_language(item.language)
        if name and any(in_text(n, text_norm) for n in LANGUAGE_NAMES[name]):
            out.setdefault(name, language_level(item.level))
    return [{"language": k, "proficiency": v.value} for k, v in out.items()]


def rules_only(text: str) -> dict:
    """Without AI: the skills and languages that can be detected reliably."""
    text_norm = normalize(text)
    languages = []
    for name, names in LANGUAGE_NAMES.items():
        for n in names:
            if m := re.search(rf"\b{n}\b[ :(\-–]*([a-z0-9 ]{{0,30}})", text_norm):
                languages.append({"language": name, "proficiency": language_level(m.group(1)).value})
                break
    return {"full_name": "", "headline": "", "experiences": [], "education": [], "projects": [],
            "skills": [{"name": s, "category": category_of(s)} for s in detect_skills(text)[:60]],
            "languages": languages}


# ---------- Entry points ----------
def parse_cv(text: str) -> tuple[dict, str, Optional[str], int]:
    """Returns (items, method, notice, removed)."""
    if not ai_enabled():
        return rules_only(text), "rules", ("AI is off on this server, so only skills and languages were "
                                           "detected. Add your roles and education by hand."), 0
    try:
        llm = require_llm()
        cv = llm.complete_json(CV_SYSTEM, f"JSON shape:\n{CV_SHAPE}\n\n<cv>\n{text[:MAX_TEXT_CHARS]}\n</cv>",
                               ParsedCV, max_tokens=4000)
    except AIUnavailable as exc:
        return rules_only(text), "rules", f"{exc} Only skills and languages were detected.", 0
    items, removed = verify(cv, text)
    return items, "ai", None, removed


def mark_existing(db: Session, user: models.User, items: dict) -> dict:
    """Flags what the profile already has, so the review screen leaves it unchecked."""
    def key(*parts):
        return "|".join(normalize(p or "") for p in parts)

    owned = lambda model: db.query(model).filter(model.owner_id == user.id).all()  # noqa: E731
    have = {
        "experiences": {key(e.company, e.title) for e in owned(models.Experience)},
        "education": {key(e.institution, e.degree) for e in owned(models.Education)},
        "projects": {key(p.name) for p in owned(models.Project)},
        "skills": {key(s.name) for s in owned(models.Skill)},
        "languages": {key(lang.language) for lang in owned(models.Language)},
    }
    keys = {"experiences": ("company", "title"), "education": ("institution", "degree"),
            "projects": ("name",), "skills": ("name",), "languages": ("language",)}
    for section, fields in keys.items():
        for item in items[section]:
            item["exists"] = key(*(item[f] for f in fields)) in have[section]
    return items


def import_items(db: Session, user: models.User, payload) -> dict:
    """Creates the reviewed items, skipping duplicates, and links skills to the roles that mention them."""
    items = payload.model_dump()
    mark_existing(db, user, {k: items[k] for k in ("experiences", "education", "projects", "languages")}
                  | {"skills": [{"name": s} for s in items["skills"]]})
    counts = {"experiences": 0, "education": 0, "projects": 0, "skills": 0, "languages": 0, "evidence": 0}

    new_experiences, new_projects = [], []
    for exp in items["experiences"]:
        if not exp.pop("exists"):
            obj = models.Experience(**exp, owner_id=user.id)
            db.add(obj)
            new_experiences.append(obj)
    for edu in items["education"]:
        if not edu.pop("exists"):
            db.add(models.Education(**edu, owner_id=user.id))
            counts["education"] += 1
    for project in items["projects"]:
        if not project.pop("exists"):
            obj = models.Project(**project, owner_id=user.id)
            db.add(obj)
            new_projects.append(obj)
    languages_seen: set[str] = set()
    for lang in items["languages"]:
        if not lang.pop("exists") and lang["language"].lower() not in languages_seen:
            languages_seen.add(lang["language"].lower())
            db.add(models.Language(language=lang["language"], proficiency=lang["proficiency"], owner_id=user.id))
            counts["languages"] += 1
    counts["experiences"], counts["projects"] = len(new_experiences), len(new_projects)

    existing_skills = {s.name.lower(): s for s in db.query(models.Skill).filter(models.Skill.owner_id == user.id)}
    skills = []
    for name in dict.fromkeys(n.strip() for n in items["skills"] if n.strip()):
        skill = existing_skills.get(name.lower())
        if skill is None:
            skill = models.Skill(name=name, category=category_of(name), owner_id=user.id)
            db.add(skill)
            existing_skills[name.lower()] = skill
            counts["skills"] += 1
        skills.append(skill)
    db.flush()

    # A bullet that names a skill is evidence for it (the user wrote it in their own CV)
    for skill in skills:
        added = 0
        for exp in new_experiences:
            for line in (exp.achievements or "").splitlines():
                if added < 3 and mentioned_in(skill.name, line):
                    db.add(models.SkillEvidence(skill_id=skill.id, evidence_type=models.EvidenceType.EXPERIENCE,
                                                source_experience_id=exp.id, description=line.strip(" -")[:500]))
                    added += 1
        for project in new_projects:
            if added < 3 and mentioned_in(skill.name, project.description or ""):
                db.add(models.SkillEvidence(skill_id=skill.id, evidence_type=models.EvidenceType.PROJECT,
                                            source_project_id=project.id,
                                            description=(project.description or "")[:500]))
                added += 1
        counts["evidence"] += added
    db.commit()
    return counts
