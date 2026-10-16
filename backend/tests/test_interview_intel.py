from datetime import date
from app.interview_intel import build_weakness_map


def _row(topic, confidence, day):
    return {"topic": topic, "confidence": confidence, "when": date(2026, 1, day)}


def test_average_and_count():
    rows = [_row("SQL", 4, 1), _row("SQL", 2, 2), _row("SQL", 3, 3)]
    result = build_weakness_map(rows)
    sql = result["topics"][0]
    assert sql["question_count"] == 3
    assert sql["average_confidence"] == 3.0
    assert sql["limited_data"] is False


def test_limited_data_flag_for_small_samples():
    result = build_weakness_map([_row("Cloud", 2, 1)])
    assert result["topics"][0]["limited_data"] is True
    assert result["topics"][0]["trend"] is None


def test_improving_trend():
    rows = [_row("System Design", c, i + 1) for i, c in enumerate([1, 2, 4, 5])]
    topic = build_weakness_map(rows)["topics"][0]
    assert topic["trend"] == "improving"
    assert topic["recent_average"] > topic["first_half_average"]


def test_unrated_questions_counted_but_not_averaged():
    rows = [_row("Python", None, 1), _row("Python", 5, 2)]
    topic = build_weakness_map(rows)["topics"][0]
    assert topic["question_count"] == 2
    assert topic["rated_count"] == 1
    assert topic["average_confidence"] == 5.0


def test_empty_input():
    result = build_weakness_map([])
    assert result["topics"] == []
    assert result["total_questions"] == 0


def _headers(client, email):
    client.post("/auth/register", json={"email": email, "password": "pass1234"})
    token = client.post("/auth/login",
                         data={"username": email, "password": "pass1234"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_user_cannot_modify_another_users_question(client):
    alice = _headers(client, "alice@example.com")
    bob = _headers(client, "bob@example.com")

    created = client.post("/interview-questions/", json={"question": "Explain indexes"},
                           headers=alice)
    assert created.status_code == 201
    qid = created.json()["id"]

    assert client.patch(f"/interview-questions/{qid}", json={"confidence": 1},
                         headers=bob).status_code == 404
    assert client.delete(f"/interview-questions/{qid}", headers=bob).status_code == 404
    assert len(client.get("/interview-questions/", headers=bob).json()) == 0


def test_confidence_must_be_between_1_and_5(client):
    headers = _headers(client, "carol@example.com")
    resp = client.post("/interview-questions/",
                        json={"question": "What is a join?", "confidence": 9}, headers=headers)
    assert resp.status_code == 422