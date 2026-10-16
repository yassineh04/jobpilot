"""Authentication, sessions, cross-user isolation and input robustness."""
from datetime import datetime, timedelta
import pytest
from jose import jwt
from app.config import settings
from tests.helpers import auth_headers, create_application


def _token_of(headers):
    return headers["Authorization"].split()[1]


# ---------- password change ----------
def test_change_password_rotates_sessions(client):
    old = auth_headers(client, "sam@x.com")
    resp = client.post("/auth/change-password", headers=old,
                       json={"current_password": "password123", "new_password": "N3w-password!"})
    assert resp.status_code == 200
    new = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    assert client.get("/auth/me", headers=old).status_code == 401      # other sessions signed out
    assert client.get("/auth/me", headers=new).status_code == 200      # this one continues
    assert client.post("/auth/login", data={"username": "sam@x.com", "password": "password123"}).status_code == 401
    assert client.post("/auth/login", data={"username": "sam@x.com", "password": "N3w-password!"}).status_code == 200


@pytest.mark.parametrize("payload,status,detail", [
    ({"current_password": "wrong-one", "new_password": "N3w-password!"}, 400, "current password is incorrect"),
    ({"current_password": "password123", "new_password": "password123"}, 400, "different"),
    ({"current_password": "password123", "new_password": "short"}, 422, None),
    ({"current_password": "password123", "new_password": "x" * 73}, 422, None),
    ({"new_password": "N3w-password!"}, 422, None),
])
def test_change_password_validation(client, payload, status, detail):
    headers = auth_headers(client)
    resp = client.post("/auth/change-password", headers=headers, json=payload)
    assert resp.status_code == status
    if detail:
        assert detail in resp.json()["detail"]
    assert client.get("/auth/me", headers=headers).status_code == 200  # failed attempts keep the session


def test_change_password_requires_authentication(client):
    assert client.post("/auth/change-password", json={"current_password": "a", "new_password": "b" * 8}).status_code == 401


# ---------- tokens ----------
def _forge(sub, key=None, **claims):
    payload = {"sub": sub, "exp": datetime.utcnow() + timedelta(hours=1), **claims}
    return jwt.encode(payload, key or settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def test_rejects_tampered_forged_and_expired_tokens(client):
    headers = auth_headers(client)
    me = client.get("/auth/me", headers=headers).json()
    token = _token_of(headers)
    bad_tokens = [
        token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb"),     # tampered signature
        _forge(me["id"], key="not-the-server-secret"),                     # wrong key
        jwt.encode({"sub": me["id"], "exp": datetime.utcnow() - timedelta(minutes=1)},
                   settings.SECRET_KEY, algorithm=settings.ALGORITHM),     # expired
        _forge("not-a-uuid"),                                              # malformed subject
        _forge("00000000-0000-0000-0000-000000000000"),                    # unknown user
        _forge(me["id"], ver=99),                                          # stale session version
        jwt.encode({"exp": datetime.utcnow() + timedelta(hours=1)}, settings.SECRET_KEY,
                   algorithm=settings.ALGORITHM),                          # no subject
        "garbage",
    ]
    for bad in bad_tokens:
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401, bad


def test_none_algorithm_is_rejected(client):
    headers = auth_headers(client)
    me = client.get("/auth/me", headers=headers).json()
    unsigned = jwt.encode({"sub": me["id"]}, "", algorithm="HS256").rsplit(".", 1)[0] + "."
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


@pytest.mark.parametrize("email", ["not-an-email", "a@", "@b.com", ""])
def test_register_rejects_invalid_emails(client, email):
    assert client.post("/auth/register", json={"email": email, "password": "password123"}).status_code == 422


def test_duplicate_registration_is_case_insensitive(client):
    client.post("/auth/register", json={"email": "Case@Example.com", "password": "password123"})
    resp = client.post("/auth/register", json={"email": "case@example.COM", "password": "password123"})
    assert resp.status_code == 400


def test_login_error_does_not_reveal_whether_the_email_exists(client):
    auth_headers(client, "known@x.com")
    unknown = client.post("/auth/login", data={"username": "nobody@x.com", "password": "password123"})
    wrong = client.post("/auth/login", data={"username": "known@x.com", "password": "wrong-password"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_password_is_never_returned(client):
    resp = client.post("/auth/register", json={"email": "p@x.com", "password": "password123"})
    assert "password" not in resp.text and "hash" not in resp.text


# ---------- cross-user isolation matrix ----------
def _alice_world(client):
    """Creates one of everything for Alice and returns the URLs Bob will try."""
    h = auth_headers(client, "alice@x.com")
    app = create_application(client, h, job_description="Python and AWS")
    interview = client.post(f"/applications/{app['id']}/interviews", headers=h,
                            json={"scheduled_at": "2030-01-01T10:00:00"}).json()
    contact = client.post("/contacts/", headers=h, json={"name": "Sarah"}).json()
    task = client.post("/tasks/", headers=h, json={"title": "Follow up"}).json()
    resume = client.post("/resumes/", headers=h, json={"name": "CV"}).json()
    topic = client.post("/interview-questions/topics", headers=h, json={"name": "Graphs"}).json()
    question = client.post("/interview-questions/", headers=h, json={"question": "Explain BFS"}).json()
    edu = client.post("/profile/education", headers=h, json={"institution": "UdeM", "degree": "BSc"}).json()
    exp = client.post("/profile/experiences", headers=h, json={"company": "X", "title": "Dev"}).json()
    proj = client.post("/profile/projects", headers=h, json={"name": "P"}).json()
    skill = client.post("/profile/skills", headers=h, json={"name": "Python"}).json()
    evidence = client.post(f"/profile/skills/{skill['id']}/evidence", headers=h,
                           json={"evidence_type": "OTHER", "description": "d"}).json()
    lang = client.post("/profile/languages", headers=h, json={"language": "French", "proficiency": "NATIVE"}).json()
    company_id = app["company"]["id"]
    return h, [
        ("get", f"/applications/{app['id']}", None), ("patch", f"/applications/{app['id']}", {"notes": "x"}),
        ("delete", f"/applications/{app['id']}", None), ("get", f"/applications/{app['id']}/events", None),
        ("get", f"/applications/{app['id']}/contacts", None), ("get", f"/applications/{app['id']}/match", None),
        ("post", f"/applications/{app['id']}/interviews", {"scheduled_at": "2030-01-01T10:00:00"}),
        ("patch", f"/interviews/{interview['id']}", {"notes": "x"}), ("delete", f"/interviews/{interview['id']}", None),
        ("get", f"/contacts/{contact['id']}", None), ("put", f"/contacts/{contact['id']}", {"name": "x"}),
        ("post", f"/contacts/{contact['id']}/interactions", None), ("delete", f"/contacts/{contact['id']}", None),
        ("patch", f"/tasks/{task['id']}", {"done": True}), ("delete", f"/tasks/{task['id']}", None),
        ("patch", f"/resumes/{resume['id']}", {"name": "x"}), ("delete", f"/resumes/{resume['id']}", None),
        ("delete", f"/interview-questions/topics/{topic['id']}", None),
        ("patch", f"/interview-questions/{question['id']}", {"notes": "x"}),
        ("delete", f"/interview-questions/{question['id']}", None),
        ("patch", f"/profile/education/{edu['id']}", {"institution": "x", "degree": "y"}),
        ("delete", f"/profile/education/{edu['id']}", None),
        ("patch", f"/profile/experiences/{exp['id']}", {"company": "x", "title": "y"}),
        ("delete", f"/profile/experiences/{exp['id']}", None),
        ("patch", f"/profile/projects/{proj['id']}", {"name": "x"}), ("delete", f"/profile/projects/{proj['id']}", None),
        ("patch", f"/profile/skills/{skill['id']}", {"name": "x"}), ("delete", f"/profile/skills/{skill['id']}", None),
        ("post", f"/profile/skills/{skill['id']}/evidence", {"evidence_type": "OTHER", "description": "d"}),
        ("delete", f"/profile/skills/{skill['id']}/evidence/{evidence['id']}", None),
        ("delete", f"/profile/languages/{lang['id']}", None),
        ("patch", f"/companies/{company_id}", {"notes": "x"}),
    ]


def test_no_user_can_read_or_change_another_users_data(client):
    alice, attempts = _alice_world(client)
    bob = auth_headers(client, "bob@x.com")
    for method, url, body in attempts:
        resp = getattr(client, method)(url, headers=bob, **({"json": body} if body is not None else {}))
        assert resp.status_code == 404, f"{method.upper()} {url} -> {resp.status_code}"
    # Alice's data is untouched
    assert len(client.get("/applications/", headers=alice).json()) == 1
    assert client.get("/contacts/", headers=alice).json()[0]["name"] == "Sarah"
    assert client.get("/tasks/", headers=alice).json()[0]["done"] is False
    # And Bob's lists, stats and search are empty
    for url in ("/applications/", "/contacts/", "/tasks/", "/resumes/", "/interview-questions/",
                "/profile/skills", "/companies/", "/calendar/interviews"):
        assert client.get(url, headers=bob).json() == [], url
    assert client.get("/stats/", headers=bob).json()["total"] == 0
    assert client.get("/search/?q=Sarah", headers=bob).json()["total"] == 0
    assert client.get("/dashboard/summary", headers=bob).json()["pipeline"][0]["count"] == 0


def test_cannot_attach_another_users_resume_or_reference(client):
    alice = auth_headers(client, "alice@x.com")
    bob = auth_headers(client, "bob@x.com")
    resume = client.post("/resumes/", headers=alice, json={"name": "Alice CV"}).json()
    app = create_application(client, alice)
    resp = client.post("/applications/", headers=bob,
                       json={"company_name": "X", "position_title": "Y", "resume_id": resume["id"]})
    assert resp.status_code == 404
    assert client.post("/interview-questions/", headers=bob,
                       json={"question": "Q?", "application_id": app["id"]}).status_code == 404


@pytest.mark.parametrize("url", ["/applications/", "/contacts/", "/tasks/", "/dashboard/summary", "/auth/me",
                                 "/analytics/overview", "/insights/market", "/profile/summary", "/search/?q=ab"])
def test_every_data_endpoint_requires_authentication(client, url):
    assert client.get(url).status_code == 401


# ---------- input robustness ----------
@pytest.mark.parametrize("term", ["' OR 1=1 --", "%", "_", "\\", "Robert'); DROP TABLE applications;--", "🚀 émoji"])
def test_search_inputs_are_treated_as_text(client, term):
    headers = auth_headers(client)
    create_application(client, headers, company_name="Acme")
    assert client.get("/applications/", params={"search": term}, headers=headers).status_code == 200
    assert client.get("/search/", params={"q": term * 2}, headers=headers).status_code == 200
    assert len(client.get("/applications/", headers=headers).json()) == 1  # nothing was dropped


def test_markup_is_stored_verbatim_not_interpreted(client):
    headers = auth_headers(client)
    payload = '<script>alert("x")</script><img src=x onerror=alert(1)>'
    app = create_application(client, headers, position_title=payload, notes=payload)
    assert client.get(f"/applications/{app['id']}", headers=headers).json()["position_title"] == payload


@pytest.mark.parametrize("payload", [
    {"company_name": "   ", "position_title": "Dev"},
    {"company_name": "Acme", "position_title": ""},
    {"company_name": "Acme", "position_title": "Dev", "status": "HIRED"},
    {"company_name": "Acme", "position_title": "Dev", "salary_min": "a lot"},
])
def test_invalid_applications_are_rejected(client, payload):
    headers = auth_headers(client)
    assert client.post("/applications/", json=payload, headers=headers).status_code == 422


def test_unexpected_errors_return_a_generic_message(client, monkeypatch):
    from app.routers import stats
    headers = auth_headers(client)
    monkeypatch.setattr(stats, "Counter", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("secret detail")))
    resp = client.get("/stats/", headers=headers)
    assert resp.status_code == 500
    assert "secret detail" not in resp.text and "Traceback" not in resp.text
    assert resp.json()["detail"].startswith("Something went wrong")


def test_cors_allows_only_the_frontend_origin(client):
    ok = client.options("/auth/login", headers={"Origin": "http://localhost:4300", "Access-Control-Request-Method": "POST"})
    bad = client.options("/auth/login", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:4300"
    assert "access-control-allow-origin" not in bad.headers
