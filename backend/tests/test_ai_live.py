"""Optional checks against a REAL provider (skipped unless AI_LIVE=1).

    AI_LIVE=1 AI_PROVIDER=ollama AI_BASE_URL=http://localhost:11534/v1 pytest tests/test_ai_live.py
    AI_LIVE=1 AI_PROVIDER=groq AI_API_KEY=gsk_... pytest tests/test_ai_live.py

They check that real model output survives validation and grounding, not exact wording.
"""
import os
import pytest
from tests.helpers import auth_headers, create_application
from tests.test_ai import POSTING

pytestmark = pytest.mark.skipif(os.environ.get("AI_LIVE") != "1", reason="set AI_LIVE=1 to call a real provider")


@pytest.fixture
def live_ai(monkeypatch):
    from app.config import settings
    for key in ("AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL"):
        monkeypatch.setattr(settings, key, os.environ.get(key, ""))


def test_live_parse(client, live_ai):
    headers = auth_headers(client)
    body = client.post("/jobs/parse", json={"text": POSTING}, headers=headers).json()
    assert body["method"] == "ai", body.get("notice")
    assert {"Python", "PostgreSQL"} <= set(body["job"]["required_skills"])
    assert body["job"]["salary"]["max"] == 130000


def test_live_brief_quotes_are_verified(client, live_ai):
    from app.grounding import quote_in_source
    headers = auth_headers(client)
    app = create_application(client, headers, job_description=POSTING)
    resp = client.post(f"/ai/applications/{app['id']}/brief", headers=headers)
    assert resp.status_code == 200, resp.text
    brief = resp.json()
    assert brief["summary"]
    for item in brief["priorities"] + brief["watch_outs"]:
        assert quote_in_source(item["quote"], POSTING)


def test_live_assistant_answers_with_sources(client, live_ai):
    headers = auth_headers(client)
    create_application(client, headers, company_name="Northwind", status="APPLIED", job_description=POSTING)
    resp = client.post("/assistant/chat", headers=headers,
                       json={"messages": [{"role": "user", "content": "Which applications am I waiting on?"}]})
    assert resp.status_code == 200, resp.text
    assert resp.json()["reply"]
    assert any(s["title"] == "Applications (1)" for s in resp.json()["sources"])
