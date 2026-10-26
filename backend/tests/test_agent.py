import json
from datetime import datetime
from app import agent, models
from tests.helpers import auth_headers, create_application

CHAT = "/agent/chat"


def call(name, args, call_id="c1"):
    """A scripted model answer that calls one tool."""
    return {"__message__": {"role": "assistant", "content": None, "tool_calls": [
        {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}}


def say(text):
    return {"__message__": {"role": "assistant", "content": text}}


def ask(client, headers, text, **context):
    return client.post(CHAT, json={"messages": [{"role": "user", "content": text}], "context": context},
                       headers=headers)


def tool_results(provider, index=-1):
    return [m["content"] for m in provider.requests[index]["messages"] if m["role"] == "tool"]


def test_tool_specs_are_valid_and_simple():
    names = [s["function"]["name"] for s in agent.TOOL_SPECS]
    assert len(names) == len(set(names))
    assert {"search_applications", "create_task", "update_application_status", "schedule_interview"} <= set(names)
    text = json.dumps(agent.TOOL_SPECS)
    assert '"type": "null"' not in text and '"title": "' not in text  # no schema titles
    for spec in agent.TOOL_SPECS:
        params = spec["function"]["parameters"]
        assert params["type"] == "object"
        # Gemini rejects a schema whose required fields are not described (a field may be named "title")
        assert set(params.get("required", [])) <= set(params["properties"]), spec["function"]["name"]
    create_task = next(s for s in agent.TOOL_SPECS if s["function"]["name"] == "create_task")
    assert create_task["function"]["parameters"]["properties"]["title"]["type"] == "string"


def test_agent_reads_data_then_answers(client, fake_ai):
    h = auth_headers(client)
    create_application(client, h, company_name="Shopify", position_title="Backend Developer", status="APPLIED")
    fake_ai.reply(call("search_applications", {"statuses": ["waiting"]}), say("You are waiting on 1 application."))
    resp = ask(client, h, "What am I waiting on?")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "agent" and body["reply"] == "You are waiting on 1 application."
    assert body["steps"] == ["Searched your applications"]
    assert body["sources"][0]["items"][0]["label"] == "Backend Developer at Shopify"
    assert "Shopify" in tool_results(fake_ai)[0]
    assert fake_ai.requests[0]["tools"] and fake_ai.requests[0]["tool_choice"] == "auto"


def test_tools_only_see_the_callers_data(client, fake_ai):
    other = auth_headers(client, email="other@x.com")
    create_application(client, other, company_name="SecretCorp")
    h = auth_headers(client)
    fake_ai.reply(call("search_applications", {}), say("None."))
    ask(client, h, "List everything")
    assert "SecretCorp" not in tool_results(fake_ai)[0]


def test_actions_are_proposed_not_executed(client, db_session, fake_ai):
    h = auth_headers(client)
    app = create_application(client, h, company_name="Shopify", status="APPLIED")
    fake_ai.reply(call("update_application_status", {"application_id": app["id"], "status": "interview"}),
                  say("I propose moving it to Interview. Confirm below."))
    body = ask(client, h, "I got an interview at Shopify").json()
    [proposal] = body["actions"]
    assert proposal["tool"] == "update_application_status"
    assert proposal["input"] == {"application_id": app["id"], "status": "INTERVIEW"}
    assert proposal["title"] == "Move Backend Developer at Shopify to Interview"
    assert "awaiting_user_confirmation" in tool_results(fake_ai)[0]
    assert client.get(f"/applications/{app['id']}", headers=h).json()["status"] == "APPLIED"

    done = client.post("/agent/actions", json={"tool": proposal["tool"], "input": proposal["input"]}, headers=h)
    assert done.status_code == 200, done.text
    assert done.json()["href"] == f"/applications/{app['id']}"
    assert client.get(f"/applications/{app['id']}", headers=h).json()["status"] == "INTERVIEW"
    events = client.get(f"/applications/{app['id']}/events", headers=h).json()
    assert any(e["event_type"] == "STATUS_CHANGED" and e["to_status"] == "INTERVIEW" for e in events)


def test_cannot_act_on_someone_elses_records(client, fake_ai):
    other = auth_headers(client, email="other@x.com")
    theirs = create_application(client, other, company_name="SecretCorp")
    h = auth_headers(client)
    fake_ai.reply(call("update_application_status", {"application_id": theirs["id"], "status": "REJECTED"}),
                  say("I could not find it."))
    body = ask(client, h, "Reject SecretCorp").json()
    assert body["actions"] == []
    assert "not found" in tool_results(fake_ai)[0]
    resp = client.post("/agent/actions", headers=h, json={
        "tool": "update_application_status", "input": {"application_id": theirs["id"], "status": "REJECTED"}})
    assert resp.status_code == 409
    assert client.get(f"/applications/{theirs['id']}", headers=other).json()["status"] == "SAVED"


def test_confirmation_revalidates_the_input(client):
    h = auth_headers(client)
    assert client.post("/agent/actions", headers=h, json={"tool": "drop_database", "input": {}}).status_code == 422
    assert client.post("/agent/actions", headers=h,
                       json={"tool": "create_task", "input": {"title": ""}}).status_code == 422
    assert client.post("/agent/actions", json={"tool": "create_task", "input": {"title": "x"}}).status_code == 401


def test_invalid_arguments_go_back_to_the_model(client, fake_ai):
    h = auth_headers(client)
    fake_ai.reply(call("create_task", {"due_date": "tomorrow"}), say("What should the task be called?"))
    body = ask(client, h, "Add a task").json()
    assert body["actions"] == [] and body["reply"] == "What should the task be called?"
    assert "Invalid arguments" in tool_results(fake_ai)[0]


def test_create_task_linked_to_application(client, fake_ai):
    h = auth_headers(client)
    app = create_application(client, h, company_name="Shopify")
    fake_ai.reply(call("create_task", {"title": "Follow up with recruiter", "kind": "follow-up",
                                       "due_date": "2026-11-02", "application_id": app["id"], "contact_id": ""}),
                  say("Proposed."))
    [proposal] = ask(client, h, "Remind me to follow up").json()["actions"]
    assert proposal["detail"] == "Follow up · due Nov 2 · Backend Developer at Shopify"
    assert "contact_id" not in proposal["input"]
    assert client.post("/agent/actions", json=proposal, headers=h).status_code == 200
    [task] = client.get("/tasks/", headers=h).json()
    assert task["title"] == "Follow up with recruiter" and task["kind"] == "FOLLOW_UP"
    assert task["application_id"] == app["id"] and task["due_date"] == "2026-11-02"


def test_schedule_interview_converts_local_time_to_utc(client, db_session, fake_ai):
    h = auth_headers(client)
    app = create_application(client, h, company_name="Shopify", status="APPLIED")
    fake_ai.reply(call("schedule_interview", {"application_id": app["id"], "scheduled_at": "2026-10-28T14:00",
                                              "interview_type": "Technical", "duration_minutes": 60}),
                  say("Proposed."))
    [proposal] = ask(client, h, "Interview Wednesday 2pm", local_time="2026-10-24T09:00 (UTC-04:00)").json()["actions"]
    assert proposal["title"] == "Schedule technical for Backend Developer at Shopify"
    assert proposal["detail"].startswith("Wed Oct 28, 14:00")
    resp = client.post("/agent/actions", headers=h, json={**proposal, "tz_offset_minutes": 240})
    assert resp.status_code == 200, resp.text
    interview = db_session.query(models.Interview).one()
    assert interview.scheduled_at == datetime(2026, 10, 28, 18, 0)


def test_add_application_and_note(client, fake_ai):
    h = auth_headers(client)
    fake_ai.reply(call("add_application", {"company_name": "Stripe", "position_title": "SRE", "status": "applied"}),
                  say("Proposed."))
    [proposal] = ask(client, h, "I applied to Stripe for SRE").json()["actions"]
    created = client.post("/agent/actions", json=proposal, headers=h).json()
    app_id = created["href"].rsplit("/", 1)[1]
    app = client.get(f"/applications/{app_id}", headers=h).json()
    assert app["status"] == "APPLIED" and app["applied_date"]

    fake_ai.reply(call("add_application_note", {"application_id": app_id, "note": "Referred by Sam"}), say("Ok."))
    [note] = ask(client, h, "Note that Sam referred me").json()["actions"]
    client.post("/agent/actions", json=note, headers=h)
    assert "Referred by Sam" in client.get(f"/applications/{app_id}", headers=h).json()["notes"]


def test_complete_task_and_log_interaction(client, fake_ai):
    h = auth_headers(client)
    task = client.post("/tasks/", json={"title": "Send portfolio"}, headers=h).json()
    contact = client.post("/contacts/", json={"name": "Sam Lee"}, headers=h).json()
    fake_ai.reply(call("open_tasks", {}),
                  {"__message__": {"role": "assistant", "content": "", "tool_calls": [
                      {"id": "a", "type": "function", "function": {"name": "complete_task",
                                                                  "arguments": json.dumps({"task_id": task["id"]})}},
                      {"id": "b", "type": "function", "function": {"name": "log_contact_interaction", "arguments":
                          json.dumps({"contact_id": contact["id"], "next_follow_up_at": "2026-11-10"})}}]}},
                  say("Two changes proposed."))
    body = ask(client, h, "I sent my portfolio to Sam").json()
    assert task["id"] in tool_results(fake_ai, 1)[0]  # open_tasks exposes ids so actions can use them
    assert [a["tool"] for a in body["actions"]] == ["complete_task", "log_contact_interaction"]
    for proposal in body["actions"]:
        assert client.post("/agent/actions", json=proposal, headers=h).status_code == 200
    assert client.get("/tasks/?status=done", headers=h).json()[0]["id"] == task["id"]
    updated = client.get(f"/contacts/{contact['id']}", headers=h).json()
    assert updated["last_interaction_at"] and updated["next_follow_up_at"] == "2026-11-10"
    # Already done: a second confirmation is refused instead of silently repeated
    assert client.post("/agent/actions", json=body["actions"][0], headers=h).status_code == 409


def test_duplicate_proposals_are_merged(client, fake_ai):
    h = auth_headers(client)
    fake_ai.reply(call("create_task", {"title": "Prep"}), call("create_task", {"title": "Prep"}, "c2"), say("Ok."))
    assert len(ask(client, h, "Add a prep task").json()["actions"]) == 1


def test_viewed_application_is_given_as_context(client, fake_ai):
    h = auth_headers(client)
    app = create_application(client, h, company_name="Shopify")
    fake_ai.reply(say("Sure."))
    ask(client, h, "Summarize this application", path=f"/applications/{app['id']}")
    system = fake_ai.requests[0]["messages"][0]["content"]
    assert f"Backend Developer at Shopify (id {app['id']}" in system


def test_loop_is_bounded(client, fake_ai):
    h = auth_headers(client)
    fake_ai.reply(*[call("pipeline_overview", {}, f"c{i}") for i in range(agent.MAX_ROUNDS - 1)], say("Done."))
    body = ask(client, h, "Loop").json()
    assert body["reply"] == "Done."
    assert len(fake_ai.requests) == agent.MAX_ROUNDS
    assert fake_ai.requests[-1]["tool_choice"] == "none"


def test_falls_back_to_read_only_assistant_without_tool_support(client, fake_ai):
    h = auth_headers(client)
    create_application(client, h, company_name="Shopify", status="APPLIED")
    fake_ai.reply(400, 400, "You have 1 application waiting.")
    body = ask(client, h, "Which applications am I waiting on?").json()
    assert body["mode"] == "read_only" and body["actions"] == []
    assert "tools" not in fake_ai.requests[-1]


def test_agent_needs_ai_configured(client):
    h = auth_headers(client)
    resp = ask(client, h, "hi")
    assert resp.status_code == 503 and "not set up" in resp.json()["detail"]
