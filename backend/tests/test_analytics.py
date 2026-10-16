from datetime import date
from app.analytics import (build_funnel, build_rejection_stats, build_resume_comparison,
                            classify)


def _row(status, interview=False, applied=date(2026, 1, 1), resume_id=None):
    return {"status": status, "has_interview": interview, "applied_date": applied,
            "resume_id": resume_id}


def test_saved_and_preparing_are_not_submitted():
    assert classify("SAVED", False, None)["submitted"] is False
    assert classify("PREPARING", False, None)["submitted"] is False


def test_withdrawn_without_applied_date_is_not_submitted():
    assert classify("WITHDRAWN", False, None)["submitted"] is False
    assert classify("WITHDRAWN", False, date(2026, 1, 1))["submitted"] is True


def test_rejection_alone_is_not_a_response():
    f = classify("REJECTED", False, date(2026, 1, 1))
    assert f["submitted"] is True and f["responded"] is False


def test_rejected_application_with_interview_counts_as_response_and_interview():
    f = classify("REJECTED", True, date(2026, 1, 1))
    assert f["responded"] is True and f["interviewed"] is True


def test_funnel_counts_and_rates():
    rows = ([_row("APPLIED")] * 6 + [_row("RECRUITER_CONTACT")] * 2 + [_row("INTERVIEW")] * 1
            + [_row("OFFER")] * 1)
    funnel = build_funnel(rows)
    counts = {s["key"]: s["count"] for s in funnel["stages"]}
    assert counts == {"submitted": 10, "responded": 4, "interviewed": 2, "final": 1, "offer": 1}
    assert funnel["steps"][0]["rate"] == 40.0
    assert funnel["limited_data"] is False


def test_bottleneck_is_lowest_eligible_step():
    rows = ([_row("APPLIED")] * 5 + [_row("RECRUITER_CONTACT")] * 3 + [_row("INTERVIEW")] * 1)
    funnel = build_funnel(rows)
    assert funnel["bottleneck"] is not None
    assert "lowest" in funnel["bottleneck"]["message"]


def test_no_bottleneck_with_tiny_sample():
    funnel = build_funnel([_row("APPLIED"), _row("INTERVIEW")])
    assert funnel["bottleneck"] is None
    assert funnel["limited_data"] is True


def test_empty_funnel_does_not_crash():
    funnel = build_funnel([])
    assert funnel["stages"][0]["count"] == 0
    assert funnel["steps"][0]["rate"] is None


def test_rejection_stats_include_unrecorded_and_counts():
    stats = build_rejection_stats(["EXPERIENCE", "EXPERIENCE", None, "SKILLS"])
    assert stats["total_rejected"] == 4
    assert stats["items"][0] == {"reason": "EXPERIENCE", "count": 2, "percent": 50.0}
    assert any(i["reason"] == "NOT_RECORDED" for i in stats["items"])
    assert stats["limited_data"] is True


def test_resume_comparison_requires_minimum_sample():
    rows = [_row("RECRUITER_CONTACT", resume_id="a")] * 3 + [_row("APPLIED", resume_id="b")] * 3
    result = build_resume_comparison(rows, {"a": "Resume A", "b": "Resume B"})
    assert "Not enough data" in result["comparison"]
    assert all(r["limited_data"] for r in result["resumes"])


def test_resume_comparison_highlights_gap_with_observational_wording():
    rows = ([_row("RECRUITER_CONTACT", resume_id="a")] * 5 + [_row("APPLIED", resume_id="a")] * 5
            + [_row("RECRUITER_CONTACT", resume_id="b")] * 1 + [_row("APPLIED", resume_id="b")] * 9)
    result = build_resume_comparison(rows, {"a": "Resume A", "b": "Resume B"})
    assert "historically been associated" in result["comparison"]
    assert "Resume A" in result["comparison"]
    assert "caused" not in result["comparison"].lower().replace("not show that one resume caused", "")


def test_unassigned_resume_is_listed_but_never_compared():
    rows = [_row("APPLIED")] * 12
    result = build_resume_comparison(rows, {})
    assert result["resumes"][0]["name"] == "No resume assigned"
    assert "Not enough data" in result["comparison"]


def _headers(client, email):
    client.post("/auth/register", json={"email": email, "password": "pass1234"})
    token = client.post("/auth/login", data={"username": email, "password": "pass1234"}
                         ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_user_cannot_touch_or_use_another_users_resume(client):
    alice = _headers(client, "alice2@example.com")
    bob = _headers(client, "bob2@example.com")

    resume = client.post("/resumes/", json={"name": "Alice CV"}, headers=alice)
    assert resume.status_code == 201
    rid = resume.json()["id"]

    assert client.patch(f"/resumes/{rid}", json={"name": "Hacked"}, headers=bob).status_code == 404
    assert client.delete(f"/resumes/{rid}", headers=bob).status_code == 404
    assert client.get("/resumes/", headers=bob).json() == []

    attach = client.post("/applications/", json={
        "company_name": "Acme", "position_title": "Dev", "resume_id": rid}, headers=bob)
    assert attach.status_code == 404