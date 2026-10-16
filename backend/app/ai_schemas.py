"""Shapes the AI must return. Validators are lenient on form (types, lengths) and strict on
content: citations are checked separately in app.grounding."""
from typing import Any, Literal, Optional, get_args, get_origin
from pydantic import BaseModel, Field, field_validator, model_validator


def _clean_str(value: Any, limit: int) -> str:
    return str(value).strip()[:limit] if value is not None else ""


class _Lenient(BaseModel):
    """Turns null lists into [], and bare strings into objects ("Python" -> {"point": "Python"})."""

    @model_validator(mode="before")
    @classmethod
    def _lists(cls, data):
        if not isinstance(data, dict):
            return data
        data = dict(data)
        for name, field in cls.model_fields.items():
            if get_origin(field.annotation) is not list:
                continue
            value = data.get(name)
            (inner,) = get_args(field.annotation) or (None,)
            if isinstance(value, str) and inner is str:
                data[name] = [value]  # "F1" -> ["F1"]
                continue
            if not isinstance(value, list):
                data[name] = []
                continue
            if isinstance(inner, type) and issubclass(inner, BaseModel):
                first_field = next(iter(inner.model_fields))
                data[name] = [{first_field: v} if isinstance(v, str) else v
                              for v in value if isinstance(v, (str, dict))]
        return data


class Cited(_Lenient):
    point: str
    quote: str = ""

    @field_validator("point", "quote", mode="before")
    @classmethod
    def _s(cls, v):
        return _clean_str(v, 400)


class Brief(_Lenient):
    summary: str = ""
    priorities: list[Cited] = []
    questions_to_ask: list[str] = []
    watch_outs: list[Cited] = []

    @field_validator("summary", mode="before")
    @classmethod
    def _s(cls, v):
        return _clean_str(v, 600)

    @field_validator("questions_to_ask", mode="before")
    @classmethod
    def _q(cls, v):
        return [_clean_str(x, 300) for x in (v or []) if x][:5]


class PracticeQuestion(_Lenient):
    question: str
    topic: Optional[str] = None
    reason: str = ""
    quote: str = ""

    @field_validator("question", "reason", "quote", mode="before")
    @classmethod
    def _s(cls, v):
        return _clean_str(v, 400)


class PracticeSet(_Lenient):
    questions: list[PracticeQuestion] = []


class Star(BaseModel):
    situation: bool = False
    task: bool = False
    action: bool = False
    result: bool = False


class Feedback(_Lenient):
    summary: str = ""
    strengths: list[str] = []
    improvements: list[str] = []
    star: Star = Star()
    evidence_ids: list[str] = []

    @field_validator("strengths", "improvements", mode="before")
    @classmethod
    def _items(cls, v):
        return [_clean_str(x, 300) for x in (v or []) if x][:5]

    @field_validator("evidence_ids", mode="before")
    @classmethod
    def _ids(cls, v):
        return [str(x).strip().strip("[]") for x in (v or [])][:5]

    @field_validator("star", mode="before")
    @classmethod
    def _star(cls, v):
        return v if isinstance(v, dict) else {}


class Draft(BaseModel):
    subject: str = ""
    body: str

    @field_validator("subject", "body", mode="before")
    @classmethod
    def _s(cls, v):
        return _clean_str(v, 3000)


class FactClaim(_Lenient):
    text: str
    fact_ids: list[str] = []

    @field_validator("text", mode="before")
    @classmethod
    def _s(cls, v):
        return _clean_str(v, 300)

    @field_validator("fact_ids", mode="before")
    @classmethod
    def _ids(cls, v):
        if isinstance(v, str):
            v = [v]
        return [str(x).strip().strip("[]") for x in (v or [])][:5]


class Debrief(_Lenient):
    headline: str = ""
    observations: list[FactClaim] = []
    focus: list[FactClaim] = []

    @field_validator("headline", mode="before")
    @classmethod
    def _s(cls, v):
        return _clean_str(v, 200)

