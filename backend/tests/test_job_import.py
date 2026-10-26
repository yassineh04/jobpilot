import gzip
import json
import httpx
import pytest
from app import job_import
from tests.helpers import auth_headers

DESCRIPTION = ("We are looking for a backend developer to build our payments platform. "
               "Requirements: 3+ years with Python and PostgreSQL, experience with Docker and AWS. "
               "Nice to have: Kubernetes. You will design APIs, review code and mentor juniors. ") * 2

PAGES: dict[str, httpx.Response] = {}
PUBLIC = {"boards.greenhouse.io", "boards-api.greenhouse.io", "jobs.lever.co", "api.lever.co",
          "jobs.ashbyhq.com", "api.ashbyhq.com", "careers.example.com", "short.example.com"}


@pytest.fixture(autouse=True)
def fake_web(monkeypatch):
    """DNS and HTTP are simulated: nothing leaves the test machine."""
    def resolve(host, port):
        ip = {"localhost": "127.0.0.1", "internal.example.com": "10.0.0.5",
              "metadata.example.com": "169.254.169.254"}.get(host, "93.184.216.34" if host in PUBLIC else None)
        if ip is None:
            raise job_import.socket.gaierror()
        return [(None, None, None, "", (ip, 0))]

    def handler(request: httpx.Request):
        response = PAGES.get(str(request.url))
        return response if response is not None else httpx.Response(404)

    PAGES.clear()
    monkeypatch.setattr(job_import, "resolve", resolve)
    monkeypatch.setattr(job_import, "transport", httpx.MockTransport(handler))


def page(url, body=None, status=200, json_body=None, headers=None):
    PAGES[url] = httpx.Response(status, json=json_body, headers=headers) if json_body is not None \
        else httpx.Response(status, text=body or "", headers=headers or {"content-type": "text/html"})


def post(client, headers, url):
    return client.post("/jobs/import-url", json={"url": url}, headers=headers)


def test_greenhouse_uses_the_public_api(client):
    h = auth_headers(client)
    page("https://boards-api.greenhouse.io/v1/boards/acme/jobs/123?pay_transparency=true", json_body={
        "title": "Backend Developer", "company_name": "Acme Corp", "location": {"name": "Montreal, QC"},
        "content": "&lt;p&gt;" + DESCRIPTION + "&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;/ul&gt;",
        "pay_input_ranges": [{"min_cents": 9500000, "max_cents": 12000000, "currency_type": "CAD"}]})
    body = post(client, h, "https://boards.greenhouse.io/acme/jobs/123").json()
    assert body["source"] == "Greenhouse" and body["method"] == "rules"
    job = body["job"]
    assert (job["title"], job["company"], job["location"]) == ("Backend Developer", "Acme Corp", "Montreal, QC")
    assert job["salary"] == {"min": 95000.0, "max": 120000.0, "currency": "CAD"}
    assert {"Python", "PostgreSQL", "Docker"} <= set(job["required_skills"])
    assert "<p>" not in body["text"] and "- Python" in body["text"]


def test_compressed_answers_are_read_once(client):
    """Real job boards send gzip; the body must not be decompressed twice."""
    h = auth_headers(client)
    payload = json.dumps({"title": "SRE", "location": {"name": "Remote"}, "content": DESCRIPTION}).encode()
    PAGES["https://boards-api.greenhouse.io/v1/boards/acme/jobs/9?pay_transparency=true"] = httpx.Response(
        200, content=gzip.compress(payload), headers={"content-encoding": "gzip", "content-type": "application/json"})
    body = post(client, h, "https://boards.greenhouse.io/acme/jobs/9").json()
    assert body["job"]["title"] == "SRE"


def test_lever_and_ashby(client):
    h = auth_headers(client)
    lever_id = "0f2b1c7e-1111-4a4b-9c9c-123456789abc"
    page(f"https://api.lever.co/v0/postings/acme-labs/{lever_id}", json_body={
        "text": "Platform Engineer", "categories": {"location": "Toronto"}, "workplaceType": "hybrid",
        "descriptionPlain": DESCRIPTION, "lists": [{"text": "Requirements", "content": "<li>Go</li>"}]})
    job = post(client, h, f"https://jobs.lever.co/acme-labs/{lever_id}").json()["job"]
    assert (job["title"], job["company"], job["location"], job["work_mode"]) == (
        "Platform Engineer", "Acme Labs", "Toronto", "HYBRID")

    ashby_id = "9d0e3b2a-2222-4b4b-8c8c-abcdefabcdef"
    page("https://api.ashbyhq.com/posting-api/job-board/beta?includeCompensation=true", json_body={"jobs": [
        {"id": ashby_id, "title": "Data Engineer", "location": "Remote", "isRemote": True,
         "descriptionPlain": DESCRIPTION}]})
    body = post(client, h, f"https://jobs.ashbyhq.com/beta/{ashby_id}").json()
    assert body["source"] == "Ashby" and body["job"]["work_mode"] == "REMOTE"
    missing = post(client, h, "https://jobs.ashbyhq.com/beta/00000000-0000-0000-0000-000000000000")
    assert missing.status_code == 422 and "not found" in missing.json()["detail"]


def test_any_career_page_with_schema_org_data(client):
    h = auth_headers(client)
    ld = {"@context": "https://schema.org", "@graph": [{"@type": "WebPage"}, {
        "@type": "JobPosting", "title": "Software Developer", "description": f"<p>{DESCRIPTION}</p>",
        "hiringOrganization": {"@type": "Organization", "name": "Example Inc."},
        "jobLocation": {"address": {"addressLocality": "Quebec City", "addressRegion": "QC"}},
        "baseSalary": {"currency": "CAD", "value": {"minValue": 80000, "maxValue": 100000, "unitText": "YEAR"}}}]}
    page("https://short.example.com/j/42", status=301, headers={"location": "https://careers.example.com/jobs/42"})
    page("https://careers.example.com/jobs/42", f"<html><head><script type='application/ld+json'>{json.dumps(ld)}"
                                                 "</script></head><body><nav>Menu</nav></body></html>")
    body = post(client, h, "short.example.com/j/42").json()  # no scheme, and a redirect
    job = body["job"]
    assert body["source"] == "careers.example.com"
    assert (job["title"], job["company"], job["location"]) == ("Software Developer", "Example Inc.", "Quebec City, QC")
    assert job["salary"]["min"] == 80000 and "Menu" not in body["text"]


def test_plain_pages_use_visible_text(client):
    h = auth_headers(client)
    page("https://careers.example.com/role", f"""<html><head><title>Backend Developer - Example</title>
        <script>var tracking = 1;</script></head><body><header>Jobs</header>
        <main><h1>Backend Developer</h1><p>{DESCRIPTION}</p></main><footer>Privacy</footer></body></html>""")
    body = post(client, h, "https://careers.example.com/role").json()
    assert body["text"].startswith("Backend Developer - Example")
    assert "tracking" not in body["text"] and "Privacy" not in body["text"]


@pytest.mark.parametrize("url, message", [
    ("http://localhost/admin", "public website"),
    ("https://internal.example.com/jobs/1", "public website"),
    ("http://metadata.example.com/latest/meta-data", "public website"),
    ("ftp://careers.example.com/file", "https://"),
    ("https://careers.example.com:8443/x", "unusual port"),
    ("https://nowhere.invalid/job", "could not be found"),
])
def test_refuses_non_public_or_odd_links(client, url, message):
    h = auth_headers(client)
    resp = post(client, h, url)
    assert resp.status_code == 422 and message in resp.json()["detail"]


def test_redirects_to_private_addresses_are_refused(client):
    h = auth_headers(client)
    page("https://careers.example.com/go", status=302, headers={"location": "http://localhost/secret"})
    assert "public website" in post(client, h, "https://careers.example.com/go").json()["detail"]


def test_sign_in_walls_and_errors_are_explained(client):
    h = auth_headers(client)
    page("https://careers.example.com/login-wall", "<html><body><p>Sign in to see this job</p></body></html>")
    assert "paste it instead" in post(client, h, "https://careers.example.com/login-wall").json()["detail"]
    page("https://careers.example.com/gone", "Not here", status=410)
    assert "(410)" in post(client, h, "https://careers.example.com/gone").json()["detail"]
    big = "x" * (job_import.MAX_BYTES + 10)
    page("https://careers.example.com/huge", big)
    assert "too large" in post(client, h, "https://careers.example.com/huge").json()["detail"]


def test_ai_extraction_runs_on_the_imported_text(client, fake_ai):
    h = auth_headers(client)
    page("https://boards-api.greenhouse.io/v1/boards/acme/jobs/7?pay_transparency=true", json_body={
        "title": "Backend Developer", "location": {"name": "Montreal"}, "content": DESCRIPTION})
    fake_ai.reply({"title": "Backend Dev (AI)", "company": None, "seniority": "MID",
                   "required_skills": ["Python", "PostgreSQL"], "salary": {}})
    body = post(client, h, "https://boards.greenhouse.io/acme/jobs/7").json()
    assert body["method"] == "ai"
    assert body["job"]["title"] == "Backend Developer"  # the board's own title wins
    assert body["job"]["company"] == "Acme" and body["job"]["seniority"] == "MID"
    assert "payments platform" in fake_ai.prompt()
