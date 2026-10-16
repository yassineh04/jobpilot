"""AI layer: provider client, grounding checks and every AI feature, with a scripted provider."""
import httpx
import pytest
from app import ai
from app.ai import AIUnavailable, ai_config, extract_json
from app.ai_schemas import Brief
from app.config import settings
from app.grounding import normalize, quote_in_source, relevant
from tests.helpers import auth_headers, create_application

POSTING = """Backend Engineer
Company: Northwind
Location: Montreal, QC

What you'll do
- Improve reliability and performance of our APIs
- Take part in the on-call rotation for the services you own

Requirements
- 3+ years of experience with Python and PostgreSQL
- Experience with Kubernetes

Salary: $110,000 - $130,000 CAD. Full-time."""


# ---------- provider configuration ----------
@pytest.mark.parametrize("provider,key,enabled", [
    ("none", "", False), ("groq", "", False), ("groq", "k", True), ("gemini", "k", True),
    ("ollama", "", True), ("unknown", "k", False), ("GROQ", "k", True),
])
def test_ai_config_per_provider(monkeypatch, provider, key, enabled):
    monkeypatch.setattr(settings, "AI_PROVIDER", provider)
    monkeypatch.setattr(settings, "AI_API_KEY", key)
    assert (ai_config() is not None) is enabled


def test_ai_config_defaults_and_overrides(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "ollama")
    cfg = ai_config()
    assert cfg.base_url == "http://ollama:11434/v1" and cfg.model == "qwen2.5:3b"
    monkeypatch.setattr(settings, "AI_MODEL", "qwen2.5:7b")
    monkeypatch.setattr(settings, "AI_BASE_URL", "http://localhost:11534/v1/")
    cfg = ai_config()
    assert cfg.base_url == "http://localhost:11534/v1" and cfg.model == "qwen2.5:7b"


def test_status_endpoint_never_leaks_the_key(client, monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "groq")
    monkeypatch.setattr(settings, "AI_API_KEY", "secret-key-123")
    body = client.get("/ai/status").json()
    assert body == {"enabled": True, "provider": "Groq", "model": "llama-3.3-70b-versatile", "local": False}
    assert "secret" not in str(body)


# ---------- client behaviour ----------
@pytest.mark.parametrize("text,expected", [
    ('{"a": 1}', {"a": 1}),
    ('```json\n{"a": 1}\n```', {"a": 1}),
    ('Sure! Here it is: {"a": {"b": 2}} Hope it helps.', {"a": {"b": 2}}),
])
def test_extract_json_tolerates_wrappers(text, expected):
    assert extract_json(text) == expected


@pytest.mark.parametrize("text", ["no json here", "[1, 2]", "{broken"])
def test_extract_json_rejects_non_objects(text):
    with pytest.raises(ValueError):
        extract_json(text)


def test_client_sends_bearer_key_json_mode_and_model(fake_ai):
    fake_ai.reply({"summary": "ok"})
    ai.require_llm().complete_json("sys", "user", Brief)
    sent = fake_ai.requests[0]
    assert sent["model"] == "llama-3.3-70b-versatile"
    assert sent["response_format"] == {"type": "json_object"}
    assert sent["messages"][0] == {"role": "system", "content": "sys"}


def test_client_repairs_invalid_json_once(fake_ai):
    fake_ai.reply("not json at all", {"summary": "fixed"})
    assert ai.require_llm().complete_json("s", "u", Brief).summary == "fixed"
    assert "not valid" in fake_ai.requests[1]["messages"][-1]["content"]


def test_client_gives_up_after_two_invalid_answers(fake_ai):
    fake_ai.reply("nope", "still nope")
    with pytest.raises(AIUnavailable, match="unexpected format"):
        ai.require_llm().complete_json("s", "u", Brief)


def test_client_retries_without_json_mode_on_400(fake_ai):
    fake_ai.reply(400, {"summary": "plain mode"})
    assert ai.require_llm().complete_json("s", "u", Brief).summary == "plain mode"
    assert "response_format" not in fake_ai.requests[1]


@pytest.mark.parametrize("status,message", [
    (429, "quota"), (401, "API key"), (403, "API key"), (404, "was not found"), (500, "returned an error"),
])
def test_client_maps_provider_errors_to_clear_messages(fake_ai, status, message):
    fake_ai.reply(status)
    with pytest.raises(AIUnavailable, match=message):
        ai.require_llm().chat([{"role": "user", "content": "x"}])


def test_client_timeout_and_network_errors(fake_ai):
    fake_ai.reply(httpx.ReadTimeout("slow"))
    with pytest.raises(AIUnavailable, match="too long"):
        ai.require_llm().chat([{"role": "user", "content": "x"}])
    fake_ai.reply(httpx.ConnectError("down"))
    with pytest.raises(AIUnavailable, match="could not be reached"):
        ai.require_llm().chat([{"role": "user", "content": "x"}])


# ---------- grounding ----------
def test_normalize_ignores_case_accents_punctuation_and_bullets():
    assert normalize("- Développeur  C++/C#, «Python»!") == "developpeur c++ c# python"


@pytest.mark.parametrize("quote,ok", [
    ("Improve reliability and performance of our APIs", True),
    ("improve RELIABILITY and performance of our apis.", True),
    ("Requirements - 3+ years of experience with Python", True),  # across a heading and bullet
    ("Improve reliability and speed of our APIs", False),          # paraphrase
    ("APIs", False),                                               # too short to count as a citation
    ("", False), (None, False),
])
def test_quote_in_source(quote, ok):
    assert quote_in_source(quote, POSTING) is ok


def test_relevance_check_uses_shared_keywords():
    assert relevant("Python experience", "Python: built internal APIs")
    assert not relevant("Kubernetes operations", "Pandas: cleaned transit data")


# ---------- job parsing ----------
def test_ai_parse_drops_invented_skills_and_fills_gaps_from_rules(fake_ai):
    fake_ai.reply({"title": "Backend Engineer", "company": None, "work_mode": "remote",
                   "required_skills": ["Python", "PostgreSQL", "Rust"], "preferred_skills": None,
                   "salary": {"min": "110k", "max": "130,000", "currency": "$"}, "languages": "English"})
    job = ai.parse_job_with_ai(POSTING)
    assert job.required_skills == ["Python", "PostgreSQL"]      # Rust is not in the posting
    assert job.company == "Northwind"                            # filled by the rule parser
    assert job.work_mode is not None and job.work_mode.value == "REMOTE"  # lowercase enum accepted
    assert (job.salary.min, job.salary.max) == (110000, 130000)
    assert job.experience_requirements                           # filled by the rule parser


def test_parse_endpoint_uses_ai_and_falls_back_with_a_notice(client, fake_ai):
    headers = auth_headers(client)
    fake_ai.reply({"title": "Backend Engineer", "required_skills": ["Python"]})
    assert client.post("/jobs/parse", json={"text": POSTING}, headers=headers).json()["method"] == "ai"
    fake_ai.reply(429)
    body = client.post("/jobs/parse", json={"text": POSTING}, headers=headers).json()
    assert body["method"] == "rules" and "quota" in body["notice"]


# ---------- application brief ----------
def _alex_with_application(client, **kw):
    headers = auth_headers(client)
    skill = client.post("/profile/skills", json={"name": "Python"}, headers=headers).json()
    exp = client.post("/profile/experiences", json={"company": "Ubisoft", "title": "Backend Intern",
                                                    "achievements": "- Cut API latency by 38%"}, headers=headers).json()
    client.post(f"/profile/skills/{skill['id']}/evidence", headers=headers,
                json={"evidence_type": "EXPERIENCE", "source_experience_id": exp["id"], "description": "Built APIs"})
    return headers, create_application(client, headers, job_description=POSTING, **kw)


def test_brief_keeps_only_verified_quotes_and_uses_engine_for_fit(client, fake_ai):
    headers, app = _alex_with_application(client)
    fake_ai.reply({
        "summary": "Backend role focused on API reliability.",
        "priorities": [{"point": "Reliability", "quote": "Improve reliability and performance of our APIs"},
                       {"point": "Invented", "quote": "Must love unicorns and rainbows"}],
        "questions_to_ask": ["How is on-call organized?"],
        "watch_outs": [{"point": "On-call", "quote": "on-call rotation for the services you own"}],
    })
    resp = client.post(f"/ai/applications/{app['id']}/brief", headers=headers)
    assert resp.status_code == 200, resp.text
    brief = resp.json()
    assert [p["point"] for p in brief["priorities"]] == ["Reliability"]
    assert brief["removed_claims"] == 1
    assert brief["strengths"][0]["skill"] == "Python"            # from the deterministic engine
    assert {"PostgreSQL", "Kubernetes"} <= set(brief["gaps"])
    assert brief["model"] == "llama-3.3-70b-versatile"
    # The posting was sent, but no other user's data
    assert "Improve reliability" in fake_ai.prompt()

    cached = client.get(f"/ai/applications/{app['id']}/brief", headers=headers).json()
    assert cached["summary"] == brief["summary"]


def test_brief_requires_a_job_description(client, fake_ai):
    headers = auth_headers(client)
    app = create_application(client, headers)
    resp = client.post(f"/ai/applications/{app['id']}/brief", headers=headers)
    assert resp.status_code == 503 and "job description" in resp.json()["detail"]
    assert fake_ai.requests == []  # no AI call wasted
    assert client.get(f"/ai/applications/{app['id']}/brief", headers=headers).status_code == 404


def test_brief_is_deleted_with_its_application(client, fake_ai, db_session):
    from app import models
    headers, app = _alex_with_application(client)
    fake_ai.reply({"summary": "x"})
    client.post(f"/ai/applications/{app['id']}/brief", headers=headers)
    assert db_session.query(models.ApplicationBrief).count() == 1
    client.delete(f"/applications/{app['id']}", headers=headers)
    db_session.expire_all()
    assert db_session.query(models.ApplicationBrief).count() == 0


# ---------- practice & coach ----------
def test_practice_maps_topics_and_drops_fake_quotes(client, fake_ai):
    headers, app = _alex_with_application(client)
    client.get("/interview-questions/topics", headers=headers)  # creates default topics
    fake_ai.reply({"questions": [
        {"question": "How would you scale an API?", "topic": "system design", "reason": "API reliability",
         "quote": "Improve reliability and performance of our APIs"},
        {"question": "Tell me about Rust.", "topic": "Rustacean", "quote": "invented quote that is long"},
        {"question": "", "topic": None},
    ]})
    body = client.post(f"/ai/applications/{app['id']}/practice", headers=headers).json()
    assert [q["topic"] for q in body["questions"]] == ["System Design", None]
    assert body["questions"][1]["quote"] == ""


def test_coach_feedback_only_suggests_relevant_own_evidence(client, fake_ai):
    headers, app = _alex_with_application(client)
    fake_ai.reply({"summary": "Good structure.", "strengths": ["Clear result"], "improvements": ["Add context"],
                   "star": {"situation": True, "task": False, "action": True, "result": True},
                   "evidence_ids": ["E1", "E2", "E99"]})
    body = client.post("/ai/feedback", headers=headers, json={
        "question": "Tell me about improving API latency",
        "answer": "At Ubisoft I profiled the API and cut latency by 38 percent using caching.",
        "application_id": app["id"]}).json()
    assert body["star"] == {"situation": True, "task": False, "action": True, "result": True}
    assert all(e["id"] != "E99" for e in body["suggested_evidence"])
    assert any("38%" in e["text"] for e in body["suggested_evidence"])


@pytest.mark.parametrize("payload", [
    {"question": "Hi", "answer": "too short"},
    {"question": "A real question here", "answer": "x" * 7000},
])
def test_coach_validates_input(client, fake_ai, payload):
    headers = auth_headers(client)
    assert client.post("/ai/feedback", json=payload, headers=headers).status_code == 422


# ---------- drafts ----------
def test_draft_is_written_as_the_candidate(client, fake_ai):
    headers, app = _alex_with_application(client)
    contact = client.post("/contacts/", json={"name": "Sarah Lavoie", "role": "Recruiter"}, headers=headers).json()
    fake_ai.reply({"subject": "Following up", "body": "Hi Sarah, ..."})
    body = client.post(f"/ai/applications/{app['id']}/draft", headers=headers,
                       json={"kind": "follow_up", "contact_id": contact["id"]}).json()
    assert body["body"].startswith("Hi Sarah")
    prompt = fake_ai.prompt()
    assert "RECIPIENT (greet this person, never the sender): Sarah Lavoie, Recruiter" in prompt
    assert "SENDER" in prompt


def test_draft_rejects_unknown_kind_and_foreign_contact(client, fake_ai):
    headers, app = _alex_with_application(client)
    other = auth_headers(client, "other@x.com")
    foreign = client.post("/contacts/", json={"name": "Someone"}, headers=other).json()
    url = f"/ai/applications/{app['id']}/draft"
    assert client.post(url, json={"kind": "spam"}, headers=headers).status_code == 422
    assert client.post(url, json={"kind": "follow_up", "contact_id": foreign["id"]}, headers=headers).status_code == 404


# ---------- weekly debrief ----------
def test_debrief_keeps_only_claims_citing_real_facts(client, fake_ai):
    headers = auth_headers(client)
    create_application(client, headers, status="APPLIED")
    fake_ai.reply({"headline": "A steady week.",
                   "observations": [{"text": "You applied once", "fact_ids": ["F1"]},
                                    {"text": "You will get hired", "fact_ids": ["F42"]},
                                    {"text": "No source", "fact_ids": []}],
                   "focus": [{"text": "Keep applying", "fact_ids": "F1"}]})
    body = client.post("/ai/debrief", headers=headers).json()
    assert [o["text"] for o in body["observations"]] == ["You applied once"]
    assert body["focus"][0]["fact_ids"] == ["F1"]
    assert body["removed_claims"] == 2
    assert body["facts"]["F1"] == "1 applications submitted in the last 7 days"


# ---------- assistant ----------
def test_assistant_retrieves_deterministically_and_returns_sources(client, fake_ai):
    headers = auth_headers(client)
    for company in ("Alpha", "Beta"):
        create_application(client, headers, company_name=company, status="APPLIED",
                           job_description="We use AWS and Python.")
    create_application(client, headers, company_name="Gamma")
    fake_ai.reply("You are waiting on 2 applications.")
    body = client.post("/assistant/chat", headers=headers,
                       json={"messages": [{"role": "user", "content": "Which ones am I waiting to hear back on?"}]}).json()
    assert body["reply"] == "You are waiting on 2 applications."
    search = next(c for c in body["tool_calls"] if c["name"] == "search_applications")
    assert search["input"]["statuses"] == ["APPLIED"]
    apps = next(s for s in body["sources"] if s["title"].startswith("Applications"))
    assert apps["title"] == "Applications (2)" and len(apps["items"]) == 2
    assert apps["items"][0]["href"].startswith("/applications/")
    assert "EXACT COUNT: 2 applications" in fake_ai.prompt()
    assert fake_ai.requests[0].get("response_format") is None  # final answer is plain text


def test_assistant_shows_an_empty_search_as_a_source(client, fake_ai):
    headers = auth_headers(client)
    create_application(client, headers, status="REJECTED", rejection_reason="UNKNOWN")
    fake_ai.reply("You are not waiting on any application.")
    body = client.post("/assistant/chat", headers=headers,
                       json={"messages": [{"role": "user", "content": "What am I waiting to hear back on?"}]}).json()
    assert {"title": "Applications (0)", "items": []} in body["sources"]


@pytest.mark.parametrize("question,expected", [
    ("Which jobs require AWS?", {"required_skills": ["AWS"]}),
    ("Quelles offres demandent AWS ou Python ?", {"any_skills": ["Python", "AWS"]}),
    ("Show my applications from the last 30 days", {"created_within_days": 30}),
    ("Applications rejected after an interview?", {"statuses": ["REJECTED", "INTERVIEW", "FINAL_INTERVIEW"]}),
])
def test_assistant_question_to_filters(db_session, question, expected):
    from app.assistant import application_filters
    filters = application_filters(db_session, None, question)
    for key, value in expected.items():
        assert sorted(filters[key]) == sorted(value) if isinstance(value, list) else filters[key] == value


@pytest.mark.parametrize("reply,total,question,expected", [
    ("You are waiting on 1 application.", 0, "Which am I waiting on?", "No application matches that."),
    ("Vous avez 2 candidatures.", 3, "Quelles offres demandent AWS ?", "3 candidatures correspondent : A, B, C."),
    ("You have 3 applications, mostly remote.", 3, "q", "You have 3 applications, mostly remote."),
    ("Several of them are remote.", 3, "q", "Several of them are remote."),  # no count claimed: kept
])
def test_assistant_counts_are_verified_against_the_data(reply, total, question, expected):
    from app.assistant import check_counts
    calls = [{"name": "search_applications", "input": {"limit": 25, "statuses": ["APPLIED"]}}]
    sources = [{"title": f"Applications ({total})", "items": [{"label": x} for x in "ABC"[:total]]}]
    assert check_counts(reply, calls, sources, question) == expected


def test_wrong_count_from_the_model_is_replaced_end_to_end(client, fake_ai):
    headers = auth_headers(client)
    create_application(client, headers, company_name="Alpha", status="APPLIED")
    fake_ai.reply("You are waiting on 4 applications.")
    body = client.post("/assistant/chat", headers=headers,
                       json={"messages": [{"role": "user", "content": "What am I waiting to hear back on?"}]}).json()
    assert body["reply"] == "1 application match: Backend Developer at Alpha."


def test_assistant_answers_in_french_when_asked_in_french(client, fake_ai):
    headers = auth_headers(client)
    fake_ai.reply("Aucune donnée.")
    client.post("/assistant/chat", headers=headers,
                json={"messages": [{"role": "user", "content": "Quelles sont mes entrevues à venir ?"}]})
    assert "Answer in French" in fake_ai.prompt()


def test_assistant_only_sees_the_callers_data(client, fake_ai):
    alice = auth_headers(client, "alice@x.com")
    bob = auth_headers(client, "bob@x.com")
    create_application(client, alice, company_name="AliceCorp")
    create_application(client, bob, company_name="BobCorp")
    fake_ai.reply("ok")
    client.post("/assistant/chat", headers=alice, json={"messages": [{"role": "user", "content": "list everything"}]})
    assert "AliceCorp" in fake_ai.prompt() and "BobCorp" not in fake_ai.prompt()


# ---------- endpoint protection ----------
AI_ENDPOINTS = [
    ("post", "/ai/applications/{id}/brief", None), ("get", "/ai/applications/{id}/brief", None),
    ("post", "/ai/applications/{id}/practice", None),
    ("post", "/ai/applications/{id}/draft", {"kind": "thank_you"}),
]


@pytest.mark.parametrize("method,url,body", AI_ENDPOINTS)
def test_ai_endpoints_refuse_other_users_applications(client, fake_ai, method, url, body):
    owner = auth_headers(client, "owner@x.com")
    intruder = auth_headers(client, "intruder@x.com")
    app = create_application(client, owner, job_description=POSTING)
    resp = getattr(client, method)(url.format(id=app["id"]), headers=intruder, **({"json": body} if body else {}))
    assert resp.status_code == 404
    assert fake_ai.requests == []


@pytest.mark.parametrize("method,url", [("post", "/ai/debrief"), ("post", "/ai/feedback"),
                                        ("post", "/assistant/chat"), ("post", "/jobs/parse")])
def test_ai_endpoints_require_authentication(client, method, url):
    assert getattr(client, method)(url, json={}).status_code == 401


def test_ai_disabled_returns_a_helpful_503(client):
    headers = auth_headers(client)
    resp = client.post("/ai/debrief", headers=headers)
    assert resp.status_code == 503 and "Settings" in resp.json()["detail"]


def test_ai_endpoints_are_rate_limited(client, fake_ai, monkeypatch):
    from app.rate_limit import ai_rate_limit
    monkeypatch.setattr(ai_rate_limit, "max_calls", 2)
    headers = auth_headers(client)
    fake_ai.reply({"headline": "a"}, {"headline": "b"}, {"headline": "c"})
    codes = [client.post("/ai/debrief", headers=headers).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
