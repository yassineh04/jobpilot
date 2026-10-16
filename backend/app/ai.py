"""Provider-agnostic LLM client over the OpenAI-compatible chat completions API.

Works with free providers: Groq, Google Gemini (OpenAI endpoint) and a local Ollama.
Every call returns JSON that is parsed and validated with Pydantic; nothing the model
says is trusted until it passes validation (and, for grounded features, citation checks).
"""
import json
import logging
import re
from dataclasses import dataclass
from typing import Optional, TypeVar
import httpx
from pydantic import BaseModel, ValidationError
from app.config import settings
from app.schemas import ParsedJob
from app.skills_catalog import mentioned_in

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

PRESETS = {
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
    "ollama": ("http://ollama:11434/v1", "qwen2.5:3b"),
    "openai_compatible": ("", ""),
}
PROVIDER_LABELS = {"groq": "Groq", "gemini": "Google Gemini", "ollama": "Ollama (local)",
                   "openai_compatible": "OpenAI-compatible"}


class AIUnavailable(Exception):
    """AI is not configured or failed. Callers fall back or show the message to the user."""


@dataclass(frozen=True)
class AIConfig:
    provider: str
    base_url: str
    model: str
    api_key: str
    timeout: float


def ai_config() -> Optional[AIConfig]:
    provider = settings.AI_PROVIDER.strip().lower()
    if provider not in PRESETS:
        return None
    base_url, model = PRESETS[provider]
    base_url = (settings.AI_BASE_URL or base_url).rstrip("/")
    model = settings.AI_MODEL or model
    if not base_url or not model:
        return None
    if provider != "ollama" and not settings.AI_API_KEY:
        return None
    return AIConfig(provider, base_url, model, settings.AI_API_KEY, settings.AI_TIMEOUT_SECONDS)


def ai_enabled() -> bool:
    return ai_config() is not None


def ai_status() -> dict:
    cfg = ai_config()
    if not cfg:
        return {"enabled": False, "provider": None, "model": None, "local": False}
    return {"enabled": True, "provider": PROVIDER_LABELS[cfg.provider], "model": cfg.model,
            "local": cfg.provider == "ollama"}


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def extract_json(text: str) -> dict:
    """Parses the first JSON object in a model answer (tolerates code fences and preamble)."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("No JSON object in the answer")
        value = json.loads(cleaned[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("The answer is not a JSON object")
    return value


class LLM:
    def __init__(self, config: AIConfig, transport: Optional[httpx.BaseTransport] = None):
        self.config = config
        headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
        self._client = httpx.Client(base_url=config.base_url, headers=headers,
                                    timeout=config.timeout, transport=transport)

    def chat(self, messages: list[dict], json_mode: bool = True, max_tokens: int = 1500,
             temperature: float = 0.2) -> str:
        body = {"model": self.config.model, "messages": messages,
                "temperature": temperature, "max_tokens": max_tokens}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        try:
            response = self._client.post("/chat/completions", json=body)
            if response.status_code == 400 and json_mode:
                # Some providers/models reject response_format: retry with prompt-only JSON
                body.pop("response_format")
                response = self._client.post("/chat/completions", json=body)
        except httpx.TimeoutException as exc:
            raise AIUnavailable("The AI took too long to answer. Try again.") from exc
        except httpx.HTTPError as exc:
            logger.warning("AI request failed: %s", type(exc).__name__)
            raise AIUnavailable("The AI service could not be reached.") from exc

        if response.status_code == 429:
            raise AIUnavailable("The free AI quota is used up for now. Try again in a minute.")
        if response.status_code in (401, 403):
            raise AIUnavailable("The AI provider rejected the API key. Check AI_API_KEY.")
        if response.status_code == 404:
            raise AIUnavailable(f"The AI model “{self.config.model}” was not found. Check AI_MODEL"
                                + (" or run `ollama pull`." if self.config.provider == "ollama" else "."))
        if response.status_code >= 400:
            logger.warning("AI provider error %s: %s", response.status_code, response.text[:300])
            raise AIUnavailable("The AI service returned an error.")
        try:
            return response.json()["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, ValueError) as exc:
            raise AIUnavailable("The AI service returned an unexpected response.") from exc

    def complete_json(self, system: str, user: str, model_cls: type[T], max_tokens: int = 1500) -> T:
        """Asks for JSON, validates it against `model_cls`; one repair attempt on invalid output."""
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        last_error = ""
        for attempt in range(2):
            text = self.chat(messages, json_mode=True, max_tokens=max_tokens)
            try:
                return model_cls.model_validate(extract_json(text))
            except (ValueError, ValidationError) as exc:
                last_error = str(exc)[:500]
                logger.info("AI output failed validation (attempt %d): %s", attempt + 1, last_error)
                messages += [{"role": "assistant", "content": text},
                             {"role": "user", "content": "Your answer was not valid. Error: "
                              f"{last_error}\nReply again with ONLY the corrected JSON object."}]
        raise AIUnavailable("The AI returned an answer in an unexpected format. Try again.")


def get_llm() -> Optional[LLM]:
    """The configured client, or None when AI is disabled. Tests replace this function."""
    cfg = ai_config()
    return LLM(cfg) if cfg else None


def require_llm() -> LLM:
    llm = get_llm()
    if llm is None:
        raise AIUnavailable("AI is not set up on this server. See Settings → AI for the free options.")
    return llm


# ---------- Job posting extraction ----------
PARSE_SYSTEM = """You extract structured data from job postings. Reply with ONE JSON object only.
Use only information explicitly written in the posting. If something is not stated, use null or [].
Never guess. Enum fields must use exactly one of the allowed values or null."""

PARSE_SHAPE = """{
  "title": string|null, "company": string|null, "location": string|null,
  "work_mode": "REMOTE"|"HYBRID"|"ON_SITE"|null,
  "employment_type": "FULL_TIME"|"PART_TIME"|"CONTRACT"|"INTERNSHIP"|"FREELANCE"|null,
  "seniority": "INTERN"|"JUNIOR"|"MID"|"SENIOR"|"LEAD"|"STAFF"|"PRINCIPAL"|null,
  "salary": {"min": number|null, "max": number|null, "currency": "CAD"|"USD"|"EUR"|...|null},
  "required_skills": [short skill names], "preferred_skills": [skills marked nice-to-have/asset/bonus],
  "education_requirements": [strings], "experience_requirements": [strings], "languages": [strings],
  "certifications": [strings], "responsibilities": [strings], "benefits": [strings]
}"""


def _ground(job: ParsedJob, text: str) -> ParsedJob:
    """Drops any skill the model returned that does not actually appear in the posting."""
    job.required_skills = [s for s in job.required_skills if mentioned_in(s, text)]
    job.preferred_skills = [s for s in job.preferred_skills
                            if mentioned_in(s, text) and s not in job.required_skills]
    return job


def parse_job_with_ai(text: str) -> ParsedJob:
    from app.job_parser import parse_job_text  # local import: job_parser imports schemas too

    llm = require_llm()
    job = _ground(llm.complete_json(PARSE_SYSTEM, f"JSON shape:\n{PARSE_SHAPE}\n\n<posting>\n{text}\n</posting>",
                                    ParsedJob, max_tokens=1500), text)
    # Small models skip fields: fill the gaps with the (verifiable) rule-based extraction
    rules = parse_job_text(text)
    for field in ParsedJob.model_fields:
        if field == "salary":
            if job.salary.min is None and job.salary.max is None:
                job.salary = rules.salary
        elif not getattr(job, field):
            setattr(job, field, getattr(rules, field))
    return job
