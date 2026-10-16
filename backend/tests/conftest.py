import json
import os
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.database import Base, get_db
from app.main import app

# SQLite by default; set TEST_DATABASE_URL=postgresql://... to run the same suite on PostgreSQL
SQLALCHEMY_TEST_URL = os.environ.get("TEST_DATABASE_URL", "sqlite:///./test.db")
engine = create_engine(SQLALCHEMY_TEST_URL,
                       connect_args={"check_same_thread": False} if SQLALCHEMY_TEST_URL.startswith("sqlite") else {})
TestingSessionLocal = sessionmaker(bind=engine)


@pytest.fixture(autouse=True)
def no_ai(monkeypatch):
    """Tests never call a real AI provider, whatever the environment says."""
    from app.config import settings
    monkeypatch.setattr(settings, "AI_PROVIDER", "none")
    monkeypatch.setattr(settings, "AI_API_KEY", "")


@pytest.fixture(autouse=True)
def reset_rate_limits():
    from app.rate_limit import ai_rate_limit
    ai_rate_limit._calls.clear()


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


class FakeProvider:
    """An OpenAI-compatible provider served by httpx.MockTransport.

    Queue answers with `reply(...)` (dict -> JSON content, str -> raw content, int -> HTTP status).
    Every request body is kept in `requests` so tests can check what was sent to the model."""

    def __init__(self):
        self.queue: list = []
        self.requests: list[dict] = []

    def reply(self, *answers):
        self.queue.extend(answers)
        return self

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(json.loads(request.content))
        if not self.queue:
            return httpx.Response(500, json={"error": "no scripted answer"})
        answer = self.queue.pop(0)
        if isinstance(answer, int):
            return httpx.Response(answer, json={"error": "scripted"})
        if isinstance(answer, Exception):
            raise answer
        content = answer if isinstance(answer, str) else json.dumps(answer)
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    def prompt(self, index: int = -1) -> str:
        return "\n".join(m["content"] for m in self.requests[index]["messages"])


@pytest.fixture
def fake_ai(monkeypatch):
    """Enables AI with a scripted provider; the real LLM client code path is exercised."""
    from app import ai
    from app.config import settings
    monkeypatch.setattr(settings, "AI_PROVIDER", "groq")
    monkeypatch.setattr(settings, "AI_API_KEY", "test-key")
    provider = FakeProvider()
    monkeypatch.setattr(ai, "get_llm", lambda: ai.LLM(ai.ai_config(), transport=httpx.MockTransport(provider.handler)))
    return provider
