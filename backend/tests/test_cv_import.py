from app import models
from app.cv_import import mostly_in_text, parse_month
from app.grounding import normalize
from tests.helpers import auth_headers, create_application
from tests.pdf import SAMPLE_CV, make_pdf

PDF = make_pdf(SAMPLE_CV)

AI_CV = {
    "full_name": "Alex Martin",
    "headline": "Backend developer - Montreal, QC",
    "experiences": [
        {"title": "Software Developer Intern", "company": "Lightspeed", "location": "Montreal",
         "start": "2024-05", "end": "2024-08",
         "bullets": ["Built a REST API in Python and FastAPI used by 3 internal teams",
                     "Reduced PostgreSQL query time by 40% with better indexes",
                     "Led a team of 12 engineers to rebuild the payments platform"]},  # not in the CV
        {"title": "Teaching Assistant", "company": "Concordia University", "start": "Sept 2023", "end": "present",
         "bullets": ["Graded assignments for the Data Structures course"]},
        {"title": "Senior Engineer", "company": "Google", "start": "2020", "end": "2022", "bullets": []},
    ],
    "education": [{"institution": "Concordia University", "degree": "Bachelor", "field": "Computer Science",
                   "start": "2022", "end": "2026", "gpa": "3.7/4.3"},
                  {"institution": "MIT", "degree": "PhD", "field": "AI", "start": "", "end": ""}],
    "projects": [{"name": "JobPilot", "description": "job search tracker built with Next.js and Docker", "url": None}],
    "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "Kubernetes"],
    "languages": [{"language": "Français", "level": "natif"}, {"language": "English", "level": "fluent"}],
}


def upload(client, headers, data=PDF, name="Alex_Martin_CV.pdf", save=True):
    return client.post("/profile/cv/parse", headers=headers, files={"file": (name, data, "application/pdf")},
                       data={"save_as_resume": str(save).lower()})


def test_rejects_files_that_are_not_usable_pdfs(client):
    h = auth_headers(client)
    assert "not a PDF" in upload(client, h, data=b"hello, I am a text file").json()["detail"]
    assert "No text" in upload(client, h, data=make_pdf(["Scan"])).json()["detail"]
    assert "5 MB" in upload(client, h, data=b"%PDF" + b"0" * (5 * 1024 * 1024)).json()["detail"]
    assert upload(client, h, data=b"").status_code == 422


def test_without_ai_detects_skills_and_languages_and_keeps_the_pdf(client):
    h = auth_headers(client)
    body = upload(client, h).json()
    assert body["method"] == "rules" and "AI is off" in body["notice"]
    assert {"Python", "FastAPI", "PostgreSQL", "Docker"} <= {s["name"] for s in body["skills"]}
    assert {(lang["language"], lang["proficiency"]) for lang in body["languages"]} == {
        ("French", "NATIVE"), ("English", "FLUENT"), ("Spanish", "BASIC")}
    assert body["experiences"] == [] and body["pages"] == 1

    resume = body["resume"]
    assert resume["name"] == "Alex Martin CV" and resume["file_name"] == "Alex_Martin_CV.pdf"
    pdf = client.get(f"/resumes/{resume['id']}/file", headers=h)
    assert pdf.status_code == 200 and pdf.content == PDF and pdf.headers["content-type"] == "application/pdf"
    # The same file again updates that resume instead of adding a copy
    assert upload(client, h).json()["resume"]["id"] == resume["id"]
    assert len(client.get("/resumes/", headers=h).json()) == 1


def test_ai_output_is_checked_against_the_cv(client, fake_ai):
    h = auth_headers(client)
    fake_ai.reply(AI_CV)
    body = upload(client, h, save=False).json()
    assert body["method"] == "ai" and body["resume"] is None
    assert [(e["title"], e["company"]) for e in body["experiences"]] == [
        ("Software Developer Intern", "Lightspeed"), ("Teaching Assistant", "Concordia University")]
    intern, assistant = body["experiences"]
    assert intern["start_date"] == "2024-05-01" and intern["end_date"] == "2024-08-01" and not intern["current"]
    assert "12 engineers" not in intern["achievements"] and "40%" in intern["achievements"]
    assert assistant["current"] and assistant["end_date"] is None and assistant["start_date"] == "2023-09-01"
    assert [e["institution"] for e in body["education"]] == ["Concordia University"]
    assert body["education"][0]["gpa"] == 3.7
    assert "Kubernetes" not in {s["name"] for s in body["skills"]}
    # Google role, invented bullet, MIT and Kubernetes were dropped
    assert body["removed"] == 4
    assert {lang["language"] for lang in body["languages"]} == {"French", "English"}
    assert "<cv>" in fake_ai.prompt() and "Lightspeed" in fake_ai.prompt()


def test_import_creates_items_links_evidence_and_skips_duplicates(client, db_session, fake_ai):
    h = auth_headers(client)
    client.post("/profile/skills", headers=h, json={"name": "Docker"})
    fake_ai.reply(AI_CV)
    parsed = upload(client, h).json()
    assert next(s for s in parsed["skills"] if s["name"] == "Docker")["exists"] is True

    payload = {
        "experiences": [{k: e[k] for k in ("title", "company", "start_date", "end_date", "achievements")}
                        for e in parsed["experiences"]],
        "education": [{k: v for k, v in e.items() if k != "exists"} for e in parsed["education"]],
        "projects": [{k: v for k, v in p.items() if k != "exists"} for p in parsed["projects"]],
        "skills": [s["name"] for s in parsed["skills"]],
        "languages": [{"language": "French", "proficiency": "NATIVE"}, {"language": "french", "proficiency": "NATIVE"}],
    }
    counts = client.post("/profile/cv/import", headers=h, json=payload).json()
    assert counts["experiences"] == 2 and counts["education"] == 1 and counts["projects"] == 1
    assert counts["languages"] == 1
    assert counts["skills"] == len(payload["skills"]) - 1  # Docker was already there

    python = db_session.query(models.Skill).filter_by(name="Python").one()
    assert [e.description for e in python.evidences] == [
        "Built a REST API in Python and FastAPI used by 3 internal teams"]
    assert python.evidences[0].source_experience.company == "Lightspeed"
    docker = db_session.query(models.Skill).filter_by(name="Docker").one()
    assert docker.evidences[0].evidence_type == models.EvidenceType.PROJECT

    again = client.post("/profile/cv/import", headers=h, json=payload).json()
    assert again == {"experiences": 0, "education": 0, "projects": 0, "skills": 0, "languages": 0, "evidence": 0}


def test_resume_files_are_private(client):
    owner = auth_headers(client)
    resume_id = upload(client, owner).json()["resume"]["id"]
    other = auth_headers(client, email="other@x.com")
    assert client.get(f"/resumes/{resume_id}/file", headers=other).status_code == 404
    assert client.put(f"/resumes/{resume_id}/file", headers=other,
                      files={"file": ("x.pdf", PDF, "application/pdf")}).status_code == 404
    cleared = client.delete(f"/resumes/{resume_id}/file", headers=owner).json()
    assert cleared["file_name"] is None
    assert client.get(f"/resumes/{resume_id}/file", headers=owner).status_code == 404


def test_attach_pdf_to_an_existing_resume(client):
    h = auth_headers(client)
    resume = client.post("/resumes/", headers=h, json={"name": "Backend"}).json()
    assert resume["file_name"] is None
    bad = client.put(f"/resumes/{resume['id']}/file", headers=h, files={"file": ("cv.txt", b"plain", "text/plain")})
    assert bad.status_code == 422
    ok = client.put(f"/resumes/{resume['id']}/file", headers=h, files={"file": ("cv.pdf", PDF, "application/pdf")})
    assert ok.status_code == 200 and ok.json()["file_size"] == len(PDF)


def test_text_helpers():
    assert parse_month("mai 2023")[0].month == 5 and parse_month("12/2021")[0].month == 12
    assert parse_month("Present") == (None, True) and parse_month("en cours") == (None, True)
    assert parse_month("soon") == (None, False)
    source = normalize("Reduced PostgreSQL query\ntime by 40% with better indexes on hot tables")
    assert mostly_in_text("Reduced PostgreSQL query time by 40% with better indexes", source)
    assert not mostly_in_text("Increased revenue by 300% across all regions", source)


def test_cv_check_compares_the_posting_with_the_cv_text(client):
    h = auth_headers(client)
    posting = ("Requirements\n- Python, PostgreSQL and Kubernetes\n- Experience with AWS\n"
               "Nice to have\n- Docker and Terraform")
    app = create_application(client, h, job_description=posting)
    assert client.get(f"/applications/{app['id']}/cv-check", headers=h).json()["status"] == "no_resume"
    empty = create_application(client, h, position_title="No description")
    assert client.get(f"/applications/{empty['id']}/cv-check", headers=h).json()["status"] == "no_posting"

    resume = upload(client, h).json()["resume"]
    body = client.get(f"/applications/{app['id']}/cv-check", headers=h).json()
    assert body["status"] == "ok" and body["resume"]["id"] == resume["id"] and not body["resume"]["attached"]
    required = {k["skill"]: k["in_cv"] for k in body["required"]}
    assert required["Python"] and required["PostgreSQL"] and not required["Kubernetes"]
    assert body["coverage"] == round(sum(required.values()) / len(required) * 100)
    assert {k["skill"]: k["in_cv"] for k in body["preferred"]}.get("Docker") is True

    client.patch(f"/applications/{app['id']}", headers=h, json={"resume_id": resume["id"]})
    assert client.get(f"/applications/{app['id']}/cv-check", headers=h).json()["resume"]["attached"]
    other = auth_headers(client, email="other@x.com")
    assert client.get(f"/applications/{app['id']}/cv-check", headers=other).status_code == 404


def test_resume_names_come_from_the_file_name():
    from app.routers.cv import resume_name
    assert resume_name("jordan-tremblay-cv.pdf") == "Jordan Tremblay CV"
    assert resume_name("Alex_Martin_CV.pdf") == "Alex Martin CV"
    assert resume_name("CV_McDonald_2026.pdf") == "CV McDonald 2026"
    assert resume_name(".pdf") == "Resume" and resume_name(None) == "Resume"
