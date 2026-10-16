import json
from app import assistant
from app.assistant import SearchApplicationsInput, execute_tool
from app.job_parser import parse_job_text, parse_salary
from app.skills_catalog import detect_skills
from tests.helpers import auth_headers, create_application

POSTING = """Senior Backend Engineer
Company: Shopify
Location: Montreal, QC

We are hybrid. Join the rest of the platform team. Go to our careers page to learn more.

What you'll do
- Build REST APIs in Python and Go
- Operate services on Kubernetes and AWS

Requirements
- 5+ years of experience building backend systems
- Strong knowledge of PostgreSQL
- Bachelor's degree in Computer Science

Nice to have
- Experience with Kafka
- AWS Certified Solutions Architect certification

Salary: $130,000 - $160,000 CAD. Full-time.
"""


def test_rule_parser_extracts_explicit_fields():
    job = parse_job_text(POSTING)
    assert job.title == "Senior Backend Engineer"
    assert job.company == "Shopify" and job.location == "Montreal, QC"
    assert job.work_mode.value == "HYBRID"
    assert job.employment_type.value == "FULL_TIME"
    assert job.seniority.value == "SENIOR"
    assert (job.salary.min, job.salary.max, job.salary.currency) == (130000, 160000, "CAD")
    assert {"Python", "Go", "REST APIs", "Kubernetes", "AWS", "PostgreSQL"} <= set(job.required_skills)
    # AWS is used in responsibilities, so it is required, not just "nice to have"
    assert job.preferred_skills == ["Kafka"]
    assert job.experience_requirements == ["5+ years of experience building backend systems"]
    assert job.education_requirements[0].startswith("Bachelor")


def test_parser_returns_nulls_instead_of_guessing():
    job = parse_job_text("We are a friendly team building nice things for our customers worldwide.")
    assert job.salary.min is None and job.work_mode is None and job.required_skills == []


def test_skill_detection_avoids_common_false_positives():
    assert detect_skills("Take a rest and go home. Contact us.") == []
    assert set(detect_skills("Experience with REST, Go, and C#/.NET")) == {"REST APIs", "Go", "C#", ".NET"}


def test_salary_ignores_year_ranges():
    assert parse_salary("Worked there 2019-2023").min is None
    assert parse_salary("Pay: 90k-110k USD").max == 110000


def test_parse_endpoint_uses_rules_without_api_key(client):
    headers = auth_headers(client)
    resp = client.post("/jobs/parse", json={"text": POSTING}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["method"] == "rules"
    assert resp.json()["job"]["company"] == "Shopify"


def test_match_reports_skills_not_found_without_claiming_lack(client):
    headers = auth_headers(client)
    skill = client.post("/profile/skills", json={"name": "Python"}, headers=headers).json()
    exp = client.post("/profile/experiences", json={"company": "Ubisoft", "title": "Backend Intern",
                                                    "start_date": "2024-01-01", "end_date": "2024-08-31"},
                      headers=headers).json()
    client.post(f"/profile/skills/{skill['id']}/evidence",
                json={"evidence_type": "EXPERIENCE", "source_experience_id": exp["id"],
                      "description": "Built internal APIs"}, headers=headers)
    app_obj = create_application(client, headers, job_description=POSTING, seniority="SENIOR")

    match = client.get(f"/applications/{app_obj['id']}/match", headers=headers).json()
    tech = match["components"]["technical"]["detail"]
    assert tech["confirmed"] == [{"skill": "Python", "evidence": ["Backend Intern at Ubisoft"]}]
    assert "PostgreSQL" in tech["not_found"]
    assert match["components"]["technical"]["score"] < 50
    assert any("years" in c for c in match["constraints"])
    assert "not a prediction" in match["explanation"]


def test_assistant_tools_only_see_the_callers_data(client, db_session):
    alice = auth_headers(client, "alice@x.com")
    bob = auth_headers(client, "bob@x.com")
    create_application(client, alice, company_name="AliceCo", job_description="AWS and Python")
    bob_app = create_application(client, bob, company_name="BobCo", job_description="AWS")

    from app import models
    alice_id = db_session.query(models.User).filter_by(email="alice@x.com").one().id

    result, is_error = execute_tool(db_session, alice_id, "search_applications", {"any_skills": ["AWS"]})
    data = json.loads(result)
    assert not is_error
    assert [a["company"] for a in data["applications"]] == ["AliceCo"]

    # Even with a valid id, another user's application is not returned
    result, _ = execute_tool(db_session, alice_id, "get_application_details",
                             {"application_id": bob_app["id"]})
    assert json.loads(result) == {"error": "Application not found"}


def test_assistant_tool_arguments_are_validated(db_session):
    result, is_error = execute_tool(db_session, None, "search_applications", {"limit": 10_000})
    assert is_error and "Invalid arguments" in result
    result, is_error = execute_tool(db_session, None, "drop_tables", {})
    assert is_error
    assert set(assistant.TOOLS_BY_NAME) >= {"search_applications", "contacts_follow_up"}
    assert SearchApplicationsInput.model_json_schema()["properties"]["limit"]["maximum"] == 25


def test_assistant_endpoint_reports_missing_configuration(client):
    headers = auth_headers(client)
    resp = client.post("/assistant/chat", json={"messages": [{"role": "user", "content": "hi"}]},
                       headers=headers)
    assert resp.status_code == 503
    assert "not set up" in resp.json()["detail"]
