def _auth_headers(client):
    client.post("/auth/register", json={"email": "u@u.com", "password": "password123"})
    login_resp = client.post("/auth/login", data={"username": "u@u.com", "password": "password123"})
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_create_and_list_application(client):
    headers = _auth_headers(client)
    resp = client.post("/applications/", json={
        "company_name": "Acme Corp",
        "position_title": "Backend Dev",
        "salary_min": 45000,
        "salary_max": 55000,
        "location": "Paris",
    }, headers=headers)
    assert resp.status_code == 201

    list_resp = client.get("/applications/", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
    
def test_search_filter(client):
    headers = _auth_headers(client)
    client.post("/applications/", json={
        "company_name": "Acme Corp",
        "position_title": "Backend Dev",
        "salary_min": 45000,
        "salary_max": 55000,
        "location": "Paris",
    }, headers=headers)
    client.post("/applications/", json={
        "company_name": "Beta Inc",
        "position_title": "Frontend Dev",
        "salary_min": 40000,
        "salary_max": 50000,
        "location": "Berlin",
    }, headers=headers)

    list_resp = client.get("/applications/?search=acme", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

def test_stats_with_saved_application(client):
    # SAVED applications have no applied_date; stats must still work
    headers = _auth_headers(client)
    client.post("/applications/", json={
        "company_name": "Acme Corp",
        "position_title": "Backend Dev",
    }, headers=headers)
    client.post("/applications/", json={
        "company_name": "Beta Inc",
        "position_title": "Frontend Dev",
        "status": "APPLIED",
    }, headers=headers)

    resp = client.get("/stats/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert sum(body["applications_per_month"].values()) == 2
