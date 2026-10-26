"""Imports a job posting from its link.

Greenhouse, Lever and Ashby publish their job boards through public JSON APIs, which give clean
fields. Any other page is read for schema.org JobPosting data (what career sites publish for Google
Jobs), then for its visible text. Requests only go to public internet addresses.
"""
import html
import ipaddress
import json
import re
import socket
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any, Optional
from urllib.parse import urljoin, urlsplit
import httpx
from app import models

MAX_BYTES = 3 * 1024 * 1024
MAX_REDIRECTS = 4
TIMEOUT = 12.0
USER_AGENT = "Mozilla/5.0 (compatible; JobPilot/1.0; +https://github.com/) job posting import"

# Replaced in tests
resolve = socket.getaddrinfo
transport: Optional[httpx.BaseTransport] = None


class JobImportError(Exception):
    """Shown to the user as is."""


@dataclass
class ImportedPosting:
    text: str
    url: str
    source: str
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    work_mode: Optional[models.WorkMode] = None
    salary: dict = field(default_factory=dict)  # {"min", "max", "currency"} when published


# ---------- Safe fetching ----------
def check_public(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise JobImportError("Paste the full link, starting with https://")
    if parts.port not in (None, 80, 443):
        raise JobImportError("This link uses an unusual port and can't be imported.")
    try:
        addresses = {info[4][0] for info in resolve(parts.hostname, None)}
    except (socket.gaierror, UnicodeError):
        raise JobImportError("This website could not be found. Check the link.")
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global or ip.is_multicast:
            raise JobImportError("This link does not point to a public website.")


@dataclass
class Page:
    status: int
    url: str  # after redirects
    body: bytes  # already decompressed
    charset: str = "utf-8"

    @property
    def text(self) -> str:
        return self.body.decode(self.charset, errors="replace")


def fetch(url: str, accept: str = "text/html,application/json") -> Page:
    """GET with every redirect target checked, a size cap and a timeout."""
    with httpx.Client(timeout=TIMEOUT, follow_redirects=False, transport=transport,
                      headers={"User-Agent": USER_AGENT, "Accept": accept,
                               "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8"}) as client:
        for _ in range(MAX_REDIRECTS + 1):
            check_public(url)
            try:
                with client.stream("GET", url) as response:
                    if response.is_redirect:
                        url = urljoin(url, response.headers.get("location", ""))
                        continue
                    body = b""
                    for chunk in response.iter_bytes():
                        body += chunk
                        if len(body) > MAX_BYTES:
                            raise JobImportError("This page is too large to import.")
                    return Page(response.status_code, url, body, response.charset_encoding or "utf-8")
            except httpx.TimeoutException:
                raise JobImportError("The website took too long to answer. Try again or paste the text.")
            except httpx.HTTPError:
                raise JobImportError("The website could not be reached. Try again or paste the text.")
    raise JobImportError("Too many redirects.")


def _json(url: str) -> Any:
    page = fetch(url, accept="application/json")
    if page.status == 404:
        raise JobImportError("This posting was not found. It may have been closed.")
    if page.status >= 400:
        raise JobImportError(f"The job board answered with an error ({page.status}).")
    try:
        return json.loads(page.text)
    except ValueError:
        raise JobImportError("The job board sent an unexpected answer.")


# ---------- HTML to text ----------
SKIP = {"script", "style", "noscript", "svg", "nav", "header", "footer", "form", "button", "iframe", "template"}
BLOCK = {"p", "div", "section", "article", "main", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol",
         "li", "tr", "table", "dt", "dd", "blockquote"}


class _Reader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skipping = 0
        self.ld_json: list[str] = []
        self.meta: dict[str, str] = {}
        self._in_ld = False
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and (a.get("type") or "").lower() == "application/ld+json":
            self._in_ld = True
            self.ld_json.append("")
        elif tag == "meta" and a.get("content"):
            key = (a.get("property") or a.get("name") or "").lower()
            if key in ("og:title", "og:site_name", "description", "og:description"):
                self.meta.setdefault(key, a["content"])
        elif tag == "title":
            self._in_title = True
        if tag in SKIP:
            self.skipping += 1
        elif tag in BLOCK:
            self.parts.append("\n- " if tag == "li" else "\n")

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_ld = False
        if tag == "title":
            self._in_title = False
        if tag in SKIP and self.skipping:
            self.skipping -= 1
        elif tag in BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_ld:
            self.ld_json[-1] += data
        elif self._in_title:
            self.meta.setdefault("title", data.strip())
        elif not self.skipping:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in raw.split("\n")]
        lines = [line for line in lines if line and line != "-"]
        return "\n".join(lines)


def html_to_text(markup: str) -> str:
    reader = _Reader()
    reader.feed(markup or "")
    return reader.text()


# ---------- Known job boards ----------
WORK_MODES = {"remote": models.WorkMode.REMOTE, "hybrid": models.WorkMode.HYBRID,
              "onsite": models.WorkMode.ON_SITE, "on-site": models.WorkMode.ON_SITE}


def _greenhouse(board: str, job_id: str, url: str) -> ImportedPosting:
    data = _json(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}?pay_transparency=true")
    text = html_to_text(html.unescape(data.get("content") or ""))
    pay = (data.get("pay_input_ranges") or [{}])[0]
    salary = {"min": pay["min_cents"] / 100, "max": pay.get("max_cents", 0) / 100 or None,
              "currency": pay.get("currency_type")} if pay.get("min_cents") else {}
    company = data.get("company_name") or board.replace("-", " ").title()
    return ImportedPosting(text=text, url=url, source="Greenhouse", title=data.get("title"), company=company,
                           location=(data.get("location") or {}).get("name"), salary=salary)


def _lever(host: str, company: str, job_id: str, url: str) -> ImportedPosting:
    api = "api.eu.lever.co" if ".eu." in host else "api.lever.co"
    data = _json(f"https://{api}/v0/postings/{company}/{job_id}")
    sections = [data.get("descriptionPlain") or ""]
    for item in data.get("lists") or []:
        sections.append(f"{item.get('text', '')}\n{html_to_text(item.get('content', ''))}")
    sections.append(data.get("additionalPlain") or "")
    categories = data.get("categories") or {}
    pay = data.get("salaryRange") or {}
    return ImportedPosting(
        text="\n\n".join(s.strip() for s in sections if s.strip()), url=url, source="Lever",
        title=data.get("text"), company=company.replace("-", " ").title(), location=categories.get("location"),
        work_mode=WORK_MODES.get((data.get("workplaceType") or "").lower()),
        salary={"min": pay.get("min"), "max": pay.get("max"), "currency": pay.get("currency")} if pay.get("min") else {})


def _ashby(org: str, job_id: str, url: str) -> ImportedPosting:
    data = _json(f"https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true")
    job = next((j for j in data.get("jobs") or [] if j.get("id") == job_id), None)
    if not job:
        raise JobImportError("This posting was not found. It may have been closed.")
    mode = WORK_MODES.get((job.get("workplaceType") or "").lower()) or (
        models.WorkMode.REMOTE if job.get("isRemote") else None)
    return ImportedPosting(text=job.get("descriptionPlain") or html_to_text(job.get("descriptionHtml", "")),
                           url=url, source="Ashby", title=job.get("title"), company=org.replace("-", " ").title(),
                           location=job.get("location"), work_mode=mode)


UUID_RE = r"[0-9a-fA-F-]{36}"


def _known_board(url: str) -> Optional[ImportedPosting]:
    parts = urlsplit(url)
    host, path = (parts.hostname or "").lower(), parts.path
    if host in ("boards.greenhouse.io", "job-boards.greenhouse.io", "job-boards.eu.greenhouse.io"):
        if m := re.match(r"^/([\w-]+)/jobs/(\d+)", path):
            return _greenhouse(m[1], m[2], url)
    if host in ("jobs.lever.co", "jobs.eu.lever.co"):
        if m := re.match(rf"^/([\w.-]+)/({UUID_RE})", path):
            return _lever(host, m[1], m[2], url)
    if host == "jobs.ashbyhq.com":
        if m := re.match(rf"^/([\w.%-]+)/({UUID_RE})", path):
            return _ashby(m[1], m[2], url)
    return None


# ---------- Any other page ----------
def _job_posting_ld(blocks: list[str]) -> Optional[dict]:
    def walk(node):
        if isinstance(node, list):
            for item in node:
                if found := walk(item):
                    return found
        elif isinstance(node, dict):
            kind = node.get("@type")
            if kind == "JobPosting" or (isinstance(kind, list) and "JobPosting" in kind):
                return node
            return walk(node.get("@graph"))
        return None

    for block in blocks:
        try:
            if found := walk(json.loads(block.strip())):
                return found
        except ValueError:
            continue
    return None


def _ld_location(posting: dict) -> Optional[str]:
    places = posting.get("jobLocation")
    places = places if isinstance(places, list) else [places] if places else []
    for place in places:
        address = (place or {}).get("address") if isinstance(place, dict) else None
        if isinstance(address, str) and address.strip():
            return address.strip()
        if isinstance(address, dict):
            country = address.get("addressCountry")
            country = country.get("name") if isinstance(country, dict) else country
            parts = [p for p in (address.get("addressLocality"), address.get("addressRegion")) if p]
            if text := ", ".join(parts) or country:
                return text
    return None


def _ld_salary(posting: dict) -> dict:
    salary = posting.get("baseSalary") or {}
    value = salary.get("value") if isinstance(salary, dict) else None
    if not isinstance(value, dict) or (value.get("unitText") or "YEAR").upper() != "YEAR":
        return {}
    low, high = value.get("minValue") or value.get("value"), value.get("maxValue")
    return {"min": float(low), "max": float(high) if high else None, "currency": salary.get("currency")} if low else {}


def _generic(url: str) -> ImportedPosting:
    page = fetch(url)
    if page.status >= 400:
        raise JobImportError("This page could not be opened "
                             f"({page.status}). If it needs a sign-in, paste the text instead.")
    url = page.url
    reader = _Reader()
    reader.feed(page.text)
    host = (urlsplit(url).hostname or "").removeprefix("www.")
    posting = _job_posting_ld(reader.ld_json)
    if posting:
        org = posting.get("hiringOrganization") or {}
        remote = posting.get("jobLocationType") == "TELECOMMUTE"
        return ImportedPosting(
            text=html_to_text(html.unescape(posting.get("description") or "")), url=url, source=host,
            title=posting.get("title"), company=org.get("name") if isinstance(org, dict) else None,
            location=_ld_location(posting), work_mode=models.WorkMode.REMOTE if remote else None,
            salary=_ld_salary(posting))
    title = reader.meta.get("og:title") or reader.meta.get("title")
    body = reader.text()
    return ImportedPosting(text=f"{title}\n{body}" if title else body, url=url, source=host,
                           company=reader.meta.get("og:site_name"))


def import_posting(url: str) -> ImportedPosting:
    url = url.strip()
    if not re.match(r"^[a-z][a-z0-9+.-]*://", url, re.IGNORECASE):
        url = "https://" + url  # "careers.acme.com/job/1"
    posting = _known_board(url) or _generic(url)
    posting.text = posting.text.strip()[:20000]
    if len(posting.text) < 200:
        raise JobImportError("No job description was found on this page. Some sites (like LinkedIn) only "
                             "show it after you sign in: copy the text and paste it instead.")
    return posting
