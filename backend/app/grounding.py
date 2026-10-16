"""Citation checks for AI output.

The AI must back each claim with either an exact quote from a source text (the job posting)
or the id of an item we gave it (profile evidence, computed facts). Anything that cannot be
verified here is dropped before the user sees it, and the number of dropped items is reported.
"""
import re
import unicodedata

MIN_QUOTE_CHARS = 8


STOPWORDS = {"the", "and", "with", "for", "you", "your", "our", "are", "will", "have", "has", "this",
              "that", "from", "into", "experience", "years", "year", "strong", "knowledge", "ability",
              "working", "work", "using", "least", "plus", "other", "their", "they", "who", "what"}


def normalize(text: str) -> str:
    """Lowercase words only: accents, punctuation, bullets and spacing are ignored ("C++"/"C#" kept)."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^\w+#]+", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def quote_in_source(quote: str | None, source: str) -> bool:
    """True if the quote's words appear contiguously in the source."""
    if not quote:
        return False
    needle = normalize(quote)
    return len(needle) >= MIN_QUOTE_CHARS and f" {needle} " in f" {normalize(source)} "


def keywords(text: str) -> set[str]:
    """Meaningful word stems (first 5 letters) for a rough relevance check."""
    return {w[:5] for w in normalize(text).split() if len(w) >= 3 and w not in STOPWORDS}


def relevant(claim: str, evidence_text: str) -> bool:
    return bool(keywords(claim) & keywords(evidence_text))


class Verifier:
    """Collects how many AI claims were removed, so the UI can say so."""

    def __init__(self):
        self.dropped = 0

    def quoted(self, items: list, source: str, attr: str = "quote") -> list:
        kept = [i for i in items if quote_in_source(getattr(i, attr), source)]
        self.dropped += len(items) - len(kept)
        return kept

    def referenced(self, items: list, valid_ids: set[str], attr: str = "evidence_ids",
                   require_one: bool = True) -> list:
        kept = []
        for item in items:
            ids = [i for i in (getattr(item, attr) or []) if i in valid_ids]
            setattr(item, attr, list(dict.fromkeys(ids)))
            if ids or not require_one:
                kept.append(item)
        self.dropped += len(items) - len(kept)
        return kept
