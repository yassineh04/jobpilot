def auth_headers(client, email="u@u.com", password="password123", full_name=None):
    client.post("/auth/register", json={"email": email, "password": password, "full_name": full_name})
    token = client.post("/auth/login", data={"username": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_application(client, headers, **overrides):
    payload = {"company_name": "Acme Corp", "position_title": "Backend Developer", **overrides}
    resp = client.post("/applications/", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()
