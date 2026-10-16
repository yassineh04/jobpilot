"""Curated catalog of technical skills used for deterministic detection in job postings.

Each entry: canonical name -> (category, aliases). Matching is whole-word and case-insensitive.
"""
import re
from functools import lru_cache

CATALOG: dict[str, tuple[str, tuple[str, ...]]] = {
    # Languages
    "Python": ("Languages", ()),
    "Java": ("Languages", ()),
    "JavaScript": ("Languages", ("JS", "ES6")),
    "TypeScript": ("Languages", ("TS",)),
    "Go": ("Languages", ("Golang",)),
    "Rust": ("Languages", ()),
    "C#": ("Languages", ("C Sharp",)),
    "C++": ("Languages", ("CPP",)),
    "Kotlin": ("Languages", ()),
    "Swift": ("Languages", ()),
    "Ruby": ("Languages", ()),
    "PHP": ("Languages", ()),
    "Scala": ("Languages", ()),
    "SQL": ("Data", ()),
    # Backend
    "Django": ("Backend", ()),
    "FastAPI": ("Backend", ()),
    "Flask": ("Backend", ()),
    "Spring Boot": ("Backend", ("Spring",)),
    "Node.js": ("Backend", ("Node", "NodeJS")),
    "Express": ("Backend", ("Express.js",)),
    ".NET": ("Backend", ("dotnet", "ASP.NET")),
    "Ruby on Rails": ("Backend", ("Rails",)),
    "REST APIs": ("Backend", ("REST", "RESTful")),
    "GraphQL": ("Backend", ()),
    "gRPC": ("Backend", ()),
    "Microservices": ("Backend", ("microservice",)),
    # Frontend
    "React": ("Frontend", ("React.js", "ReactJS")),
    "Next.js": ("Frontend", ("NextJS",)),
    "Vue.js": ("Frontend", ("Vue",)),
    "Angular": ("Frontend", ()),
    "Svelte": ("Frontend", ()),
    "HTML": ("Frontend", ("HTML5",)),
    "CSS": ("Frontend", ("CSS3",)),
    "Tailwind CSS": ("Frontend", ("Tailwind",)),
    "Redux": ("Frontend", ()),
    # Mobile
    "React Native": ("Mobile", ()),
    "Flutter": ("Mobile", ()),
    "Android": ("Mobile", ()),
    "iOS": ("Mobile", ()),
    # Data
    "PostgreSQL": ("Data", ("Postgres",)),
    "MySQL": ("Data", ()),
    "MongoDB": ("Data", ("Mongo",)),
    "Redis": ("Data", ()),
    "Elasticsearch": ("Data", ("Elastic",)),
    "Kafka": ("Data", ("Apache Kafka",)),
    "Spark": ("Data", ("Apache Spark", "PySpark")),
    "Airflow": ("Data", ("Apache Airflow",)),
    "Snowflake": ("Data", ()),
    "BigQuery": ("Data", ()),
    "dbt": ("Data", ()),
    "Pandas": ("Data", ()),
    "Tableau": ("Data", ()),
    "Power BI": ("Data", ("PowerBI",)),
    # ML
    "Machine Learning": ("Machine Learning", ("ML",)),
    "PyTorch": ("Machine Learning", ()),
    "TensorFlow": ("Machine Learning", ()),
    "scikit-learn": ("Machine Learning", ("sklearn",)),
    "LLMs": ("Machine Learning", ("LLM", "large language models")),
    # Cloud
    "AWS": ("Cloud", ("Amazon Web Services",)),
    "Azure": ("Cloud", ("Microsoft Azure",)),
    "GCP": ("Cloud", ("Google Cloud", "Google Cloud Platform")),
    "Serverless": ("Cloud", ("Lambda",)),
    # DevOps
    "Docker": ("DevOps", ()),
    "Kubernetes": ("DevOps", ("K8s",)),
    "Terraform": ("DevOps", ()),
    "CI/CD": ("DevOps", ("continuous integration", "continuous delivery")),
    "GitHub Actions": ("DevOps", ()),
    "Jenkins": ("DevOps", ()),
    "Linux": ("DevOps", ()),
    "Ansible": ("DevOps", ()),
    "Prometheus": ("DevOps", ()),
    "Grafana": ("DevOps", ()),
    # Practices
    "Git": ("Practices", ()),
    "Agile": ("Practices", ("Scrum",)),
    "Unit Testing": ("Practices", ("unit tests", "TDD", "pytest", "Jest")),
    "System Design": ("Practices", ("distributed systems",)),
    "Security": ("Practices", ("OWASP", "application security")),
}

LANGUAGES = ["English", "French", "Spanish", "German", "Mandarin", "Arabic",
             "Portuguese", "Italian", "Japanese", "Hindi"]


def _pattern(term: str) -> str:
    # Word boundaries that also work for terms like "C#", "C++", ".NET", "CI/CD"
    return r"(?<![\w.+#])" + re.escape(term) + r"(?![\w+#])"


# "Go" is also an English verb: only count it next to list punctuation or another skill
_GO_PATTERN = re.compile(r"\bGolang\b|(?<![\w.])Go(?=\s*[,/);]|\s+(?:and|or)\s+[A-Z]|\s*$)",
                         re.MULTILINE)


def _term_regex(term: str) -> re.Pattern:
    # Short all-caps acronyms (REST, ML, JS...) are case-sensitive so "the rest of" never matches
    case_sensitive = term.isupper() and len(term) <= 5
    return re.compile(_pattern(term), 0 if case_sensitive else re.IGNORECASE)


@lru_cache(maxsize=1)
def _compiled() -> list[tuple[str, list[re.Pattern]]]:
    entries = []
    for name, (_, aliases) in CATALOG.items():
        regexes = [_GO_PATTERN] if name == "Go" else [_term_regex(t) for t in (name, *aliases)]
        entries.append((name, regexes))
    return entries


def detect_skills(text: str) -> list[str]:
    """Canonical skill names mentioned in the text, in catalog order."""
    if not text:
        return []
    return [name for name, regexes in _compiled() if any(r.search(text) for r in regexes)]


def category_of(skill_name: str) -> str | None:
    canonical = canonical_name(skill_name)
    return CATALOG[canonical][0] if canonical else None


def canonical_name(skill_name: str) -> str | None:
    """Maps a user-entered skill (e.g. "postgres") to its catalog name, if known."""
    needle = skill_name.strip().lower()
    for name, (_, aliases) in CATALOG.items():
        if needle == name.lower() or needle in (a.lower() for a in aliases):
            return name
    return None


def mentioned_in(skill_name: str, text: str) -> bool:
    """True if the skill (or one of its catalog aliases) appears in the text."""
    canonical = canonical_name(skill_name)
    if canonical:
        return canonical in detect_skills(text)
    term = skill_name.strip()
    return bool(term) and bool(re.search(_pattern(term), text, re.IGNORECASE))
