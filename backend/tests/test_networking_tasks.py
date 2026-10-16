from datetime import date, timedelta
from tests.helpers import auth_headers, create_application


def test_contact_crud_links_company_and_applications(client):
    headers = auth_headers(client)
    app_obj = create_application(client, headers, company_name="Shopify")

    resp = client.post("/contacts/", json={
        "name": "Sarah Smith", "company_name": "Shopify", "role": "Recruiter",
        "relationship_type": "RECRUITER", "application_ids": [app_obj["id"]],
        "next_follow_up_at": date.today().isoformat(),
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    contact = resp.json()
    # The contact reuses the existing company instead of duplicating it
    assert contact["company_name"] == "Shopify"
    assert contact["company_id"] == app_obj["company"]["id"]
    assert [a["id"] for a in contact["applications"]] == [app_obj["id"]]

    due = client.get("/contacts/?follow_up_due=true", headers=headers).json()
    assert [c["id"] for c in due] == [contact["id"]]

    logged = client.post(f"/contacts/{contact['id']}/interactions", headers=headers).json()
    assert logged["last_interaction_at"] == date.today().isoformat()
    assert logged["next_follow_up_at"] is None

    events = client.get(f"/applications/{app_obj['id']}/events", headers=headers).json()
    assert [e["event_type"] for e in events] == ["CREATED", "CONTACT_LINKED"]

    assert client.delete(f"/contacts/{contact['id']}", headers=headers).status_code == 204
    assert client.get("/contacts/", headers=headers).json() == []


def test_blank_optional_contact_fields_are_accepted(client):
    headers = auth_headers(client)
    resp = client.post("/contacts/", json={"name": "John", "email": "", "linkedin_url": "",
                                           "company_name": ""}, headers=headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["email"] is None and resp.json()["company_name"] is None


def test_contacts_are_isolated_between_users(client):
    alice = auth_headers(client, "alice@x.com")
    bob = auth_headers(client, "bob@x.com")
    contact = client.post("/contacts/", json={"name": "Sarah"}, headers=alice).json()
    bob_app = create_application(client, bob)

    assert client.get(f"/contacts/{contact['id']}", headers=bob).status_code == 404
    assert client.put(f"/contacts/{contact['id']}", json={"name": "x"}, headers=bob).status_code == 404
    assert client.delete(f"/contacts/{contact['id']}", headers=bob).status_code == 404
    assert client.get("/contacts/", headers=bob).json() == []
    # Alice cannot link Bob's application to her contact
    resp = client.put(f"/contacts/{contact['id']}",
                      json={"name": "Sarah", "application_ids": [bob_app["id"]]}, headers=alice)
    assert resp.status_code == 404


def test_task_lifecycle(client):
    headers = auth_headers(client)
    app_obj = create_application(client, headers)
    due = (date.today() + timedelta(days=2)).isoformat()
    task = client.post("/tasks/", json={"title": "Send thank-you email", "kind": "FOLLOW_UP",
                                        "due_date": due, "application_id": app_obj["id"]},
                       headers=headers).json()
    assert task["done"] is False
    assert task["application"]["company_name"] == "Acme Corp"

    done = client.patch(f"/tasks/{task['id']}", json={"done": True}, headers=headers).json()
    assert done["done"] is True and done["completed_at"]
    assert client.get("/tasks/?status=open", headers=headers).json() == []
    assert len(client.get("/tasks/?status=done", headers=headers).json()) == 1

    reopened = client.patch(f"/tasks/{task['id']}", json={"done": False}, headers=headers).json()
    assert reopened["done"] is False


def test_tasks_reject_foreign_references(client):
    alice = auth_headers(client, "alice@x.com")
    bob = auth_headers(client, "bob@x.com")
    bob_app = create_application(client, bob)
    resp = client.post("/tasks/", json={"title": "x", "application_id": bob_app["id"]}, headers=alice)
    assert resp.status_code == 404
    bob_task = client.post("/tasks/", json={"title": "Bob task"}, headers=bob).json()
    assert client.patch(f"/tasks/{bob_task['id']}", json={"done": True}, headers=alice).status_code == 404
