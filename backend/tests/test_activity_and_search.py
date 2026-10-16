from datetime import datetime, timedelta
from tests.helpers import auth_headers, create_application

JD = ("We need a backend developer with Python, PostgreSQL and AWS. Docker is required. "
      "Bachelor's degree in computer science.")


def test_status_changes_are_recorded_as_events(client):
    headers = auth_headers(client)
    app_obj = create_application(client, headers)
    client.patch(f"/applications/{app_obj['id']}", json={"status": "APPLIED"}, headers=headers)
    client.patch(f"/applications/{app_obj['id']}", json={"notes": "no status change"}, headers=headers)
    client.patch(f"/applications/{app_obj['id']}", json={"status": "INTERVIEW"}, headers=headers)
    client.post(f"/applications/{app_obj['id']}/interviews",
                json={"scheduled_at": (datetime.utcnow() + timedelta(days=3)).isoformat(),
                      "interview_type": "Technical"}, headers=headers)

    events = client.get(f"/applications/{app_obj['id']}/events", headers=headers).json()
    assert [(e["event_type"], e["to_status"]) for e in events] == [
        ("CREATED", "SAVED"), ("STATUS_CHANGED", "APPLIED"),
        ("STATUS_CHANGED", "INTERVIEW"), ("INTERVIEW_SCHEDULED", None)]

    assert events[1]["from_status"] == "SAVED"


def test_rejection_reason_is_cleared_when_leaving_rejected(client):
    headers = auth_headers(client)
    app_obj = create_application(client, headers, status="REJECTED", rejection_reason="SKILLS")
    updated = client.patch(f"/applications/{app_obj['id']}", json={"status": "APPLIED"},
                           headers=headers).json()
    assert updated["rejection_reason"] is None


def test_events_are_private(client):
    alice = auth_headers(client, "alice@x.com")
    bob = auth_headers(client, "bob@x.com")
    app_obj = create_application(client, alice)
    assert client.get(f"/applications/{app_obj['id']}/events", headers=bob).status_code == 404


def test_dashboard_summary(client):
    headers = auth_headers(client, full_name="Alex Martin")
    create_application(client, headers, job_description=JD, location="Montreal", status="APPLIED")
    create_application(client, headers, company_name="Beta", job_description=JD, location="Montreal")
    data = client.get("/dashboard/summary", headers=headers).json()
    assert data["user_name"] == "Alex Martin"
    assert data["kpis"]["active_applications"] == 1
    assert data["kpis"]["applied_this_week"] == 1
    assert data["insights"]["top_location"] == "Montreal"
    assert data["insights"]["top_skill"] in {"Python", "PostgreSQL", "AWS", "Docker"}
    assert {p["status"]: p["count"] for p in data["pipeline"]}["SAVED"] == 1
    assert len(data["recent_activity"]) == 2


def test_market_insights_flag_skills_missing_from_profile(client):
    headers = auth_headers(client)
    client.post("/profile/skills", json={"name": "postgres"}, headers=headers)
    for company in ("A", "B", "C"):
        create_application(client, headers, company_name=company, job_description=JD)
    data = client.get("/insights/market", headers=headers).json()
    skills = {s["skill"]: s for s in data["skills"]}
    assert skills["Python"]["percent"] == 100.0
    # "postgres" in the profile is recognised as PostgreSQL via the catalog aliases
    assert skills["PostgreSQL"]["in_profile"] is True
    assert "AWS" in {s["skill"] for s in data["skill_gaps"]}
    assert data["limited_data"] is True


def test_global_search_groups_results_and_is_scoped(client):
    alice = auth_headers(client, "alice@x.com")
    bob = auth_headers(client, "bob@x.com")
    create_application(client, alice, job_description="Strong PostgreSQL skills")
    client.post("/contacts/", json={"name": "Postgres Pete"}, headers=alice)
    client.post("/profile/skills", json={"name": "PostgreSQL"}, headers=alice)

    data = client.get("/search/?q=postgres", headers=alice).json()
    labels = {g["type"]: len(g["items"]) for g in data["groups"]}
    assert labels == {"applications": 1, "contacts": 1, "profile": 1}
    assert client.get("/search/?q=postgres", headers=bob).json()["total"] == 0
    assert client.get("/search/?q=p", headers=alice).status_code == 422


def test_me_and_settings(client):
    headers = auth_headers(client, "Mixed.Case@Example.com", full_name="Sam")
    me = client.get("/auth/me", headers=headers).json()
    assert me["email"] == "mixed.case@example.com" and me["email_reminders"] is True
    updated = client.patch("/auth/me", json={"email_reminders": False, "full_name": "Sam Lee"},
                           headers=headers).json()
    assert updated["email_reminders"] is False and updated["full_name"] == "Sam Lee"
    # Login is case-insensitive on the email
    resp = client.post("/auth/login", data={"username": "MIXED.case@example.com", "password": "password123"})
    assert resp.status_code == 200


def test_register_rejects_short_password(client):
    resp = client.post("/auth/register", json={"email": "a@b.com", "password": "short"})
    assert resp.status_code == 422


def test_analytics_overview_includes_timing_and_breakdowns(client):
    headers = auth_headers(client)
    for source in ("LinkedIn", "LinkedIn", "Referral"):
        a = create_application(client, headers, company_name=source + "co", source=source, status="APPLIED")
        client.patch(f"/applications/{a['id']}", json={"status": "RECRUITER_CONTACT"}, headers=headers)
    data = client.get("/analytics/overview", headers=headers).json()
    sources = {b["label"]: b for b in data["breakdowns"]["source"]}
    assert sources["LinkedIn"]["applications"] == 2 and sources["LinkedIn"]["response_rate"] == 100.0
    assert data["timing"]["first_response"]["n"] == 3
