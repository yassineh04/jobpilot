def test_register_user(client):
    resp = client.post("/auth/register", json={"email": "test@example.com", "password": "password123", "full_name": "Test User"})
    
    assert resp.status_code == 201
    assert resp.json()["email"] == "test@example.com"
    
    login_resp = client.post("/auth/login", data={"username": "test@example.com", "password": "password123"})
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()
    
def test_duplicate_register_fails(client):
    client.post("/auth/register", json={"email": "a@a.com", "password": "password123"})
    resp = client.post("/auth/register", json={"email": "a@a.com", "password": "password123"})
    assert resp.status_code == 400