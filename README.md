# JobPilot

JobPilot is a personal job-search workspace. It tracks applications, interviews, resumes and contacts,
and turns that history into structured, honest insight: where applications stall, how long responses
take, which skills keep coming up in the postings you save, and how a posting compares with your profile.

It never predicts whether you will get hired. Every score is a documented formula, every statistic shows
its sample size, and every AI statement is checked against its source before you see it.

## Features

| Area | What it does |
| --- | --- |
| Overview | Active applications, interviews, follow-ups due, deadlines, recent activity, AI weekly debrief |
| Applications | Kanban board (drag & drop) and list, filters, tags, deadlines, resume used |
| Application page | Brief (AI), fit score, interviews, history, linked contacts and tasks, message drafts (AI) |
| Agenda | Month calendar with interviews, task due dates and application deadlines, plus the task list |
| Interview prep | AI practice with feedback, question bank, weakness map |
| Profile & resumes | Experience, education, projects, skills backed by evidence, languages, preferences, resume versions |
| Contacts | Recruiters and referrals, last interaction, next follow-up, linked applications |
| Analytics | Pipeline (activity, funnel, bottleneck), What works (sources, timing, resumes, rejections), Market |
| Ask JobPilot | Questions about your own data, answered with the exact records used |
| Search | Ctrl/Cmd + K across applications, companies, contacts, questions, interviews, profile and tasks |

## AI that shows its sources

The AI is free (no paid API) and optional. What makes it different: **the model never gets the last word**.

| Feature | What the AI does | What the code verifies |
| --- | --- | --- |
| Posting extraction | Reads a pasted posting into structured fields | Skills must appear in the text; empty fields are filled by the rule-based parser |
| Application brief | Summary, employer priorities, questions to ask, things to clarify | Every priority and watch-out quotes the posting word for word, or it is removed. Your fit comes from the deterministic engine, not the AI |
| Interview practice | Likely questions for this posting, weighted toward your weakest topics | Topics must be yours; quotes must exist in the posting |
| Answer coach | STAR structure check, strengths, improvements | Suggested examples must be experiences you recorded, and relevant to the question |
| Message drafts | Thank-you, follow-up and networking messages | Written only from your application facts; unknowns become [placeholders] |
| Weekly debrief | What moved, what's waiting, 3 focus actions | Every line must cite facts the server computed from your data |
| Ask JobPilot | Writes the answer | The server picks and runs the read-only lookups (no SQL from the model); the exact records are shown under the answer, and a count that disagrees with them is replaced by the real one |

The UI always says how many unverifiable statements were removed.

### Free providers

Set in `backend/.env`, then restart the API:

| `AI_PROVIDER` | Cost / setup | Notes |
| --- | --- | --- |
| `ollama` | Free, no account. Runs in Docker (`COMPOSE_PROFILES=local-ai`, default) | Private: data stays on your computer. `qwen2.5:3b` by default; 30-60 s per request on a laptop CPU. Use `AI_MODEL=qwen2.5:7b` with 16 GB+ for better answers |
| `groq` | Free API key from console.groq.com (no card) + `AI_API_KEY` | Fast (1-3 s) and the best quality of the free options (`llama-3.3-70b-versatile`) |
| `gemini` | Free API key from aistudio.google.com + `AI_API_KEY` | `gemini-2.5-flash` |
| `none` | | AI features hidden; everything else works |

Any OpenAI-compatible endpoint also works (`AI_PROVIDER=openai_compatible`, `AI_BASE_URL`, `AI_MODEL`).

## Architecture

```mermaid
flowchart LR
    UI["Next.js 16 (App Router)<br/>React, Tailwind CSS 4"] -->|REST + JWT| API["FastAPI"]
    API --> DB[("PostgreSQL<br/>SQLAlchemy + Alembic")]
    API --> SCH["APScheduler<br/>interview reminder emails"]
    API -.optional, free.-> AI["OpenAI-compatible LLM<br/>Ollama · Groq · Gemini"]
```

```
backend/app/
  main.py            app, CORS, error middleware, routers
  models.py          SQLAlchemy models          schemas.py   Pydantic request/response models
  routers/           one module per resource (applications, ai, contacts, tasks, ...)
  matching.py        compatibility engine (deterministic)
  analytics.py       funnel, rejection, timing, breakdown and resume statistics
  job_parser.py      rule-based posting parser   skills_catalog.py   skill dictionary
  ai.py              provider-agnostic LLM client (JSON mode, validation, one repair retry)
  ai_features.py     brief, practice, coach, drafts, debrief      ai_schemas.py  their shapes
  grounding.py       citation checks (quotes, ids, relevance)
  assistant.py       deterministic retrieval + answer
  seed.py            demo accounts
backend/alembic/     migrations 0000 -> 0007
frontend/            app/(app) pages, components/ui design system, components/ai, lib (API client, hooks)
e2e/                 Playwright scenario + axe-core accessibility audit
```

## Getting started

```bash
docker compose up -d --build                     # migrations run on start; the local model downloads once
docker compose exec backend python -m app.seed   # optional: demo accounts
```

- App: http://localhost:4300 · API docs: http://localhost:8300/docs
- PostgreSQL from the host: `localhost:5543` (user/password/db: `tracker`) · Ollama: `localhost:11534`

### Local development

```bash
docker compose up -d db ollama
cd backend && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
set DATABASE_URL=postgresql://tracker:tracker@localhost:5543/tracker_db
set AI_BASE_URL=http://localhost:11534/v1        # when using the Docker Ollama from the host
alembic upgrade head && python -m app.seed && uvicorn app.main:app --reload --port 8300
cd ../frontend && npm install && npm run dev     # http://localhost:4300
```

### Demo accounts

Created by `python -m app.seed` (re-running it resets only these accounts). Password for all: `Demo1234!`

| Email | Content |
| --- | --- |
| `alex@jobpilot.dev` | Backend developer, ~4 months of history: 32 applications, interviews, questions, contacts, tasks, 3 resumes, full profile |
| `sam@jobpilot.dev` | Data analyst, smaller dataset |
| `new@jobpilot.dev` | Empty account, to see onboarding and empty states |

## Configuration (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key, **change it in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session length (default 24 h) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Interview reminder emails (skipped when not set) |
| `FRONTEND_URL` | Allowed CORS origin |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `AI_TIMEOUT_SECONDS` | Free AI, see above |

Frontend: `NEXT_PUBLIC_API_URL` (default `http://localhost:8300`, read at build time).

## Testing

```bash
cd backend && pytest                       # 157 tests, SQLite, no network (AI via a scripted fake provider)
TEST_DATABASE_URL=postgresql://... pytest  # same suite on PostgreSQL
AI_LIVE=1 AI_PROVIDER=ollama AI_BASE_URL=http://localhost:11534/v1 pytest tests/test_ai_live.py
cd frontend && npm test && npm run lint && npm run build
cd e2e && npm install && npx playwright install chromium
npm test                                   # full browser scenario (run the seed first)
npm run a11y                               # WCAG 2.1 AA audit of every page
```

Backend suites: auth and sessions (password change signs out other devices, forged/expired/stale tokens),
a cross-user isolation matrix over every resource and method, input robustness (injection strings, markup),
AI client behaviour (JSON repair, provider errors, timeouts), grounding (quotes, ids, relevance) and every
AI feature and endpoint (ownership, rate limits, disabled AI), plus analytics, matching, parser and search.

## How the numbers are computed

**Compatibility** (deterministic, inspectable in the UI): technical 40 %, experience 20 %, education 10 %,
location 10 %, preferences 20 %; components without data are skipped and their weight redistributed. A
posting skill counts 1 if your profile has it with evidence, 0.5 without evidence, 0 if not in your profile
("not in your profile" never means "you lack it").

**Analytics**: submitted = left Saved/Preparing; response = recruiter contact or later, or a recorded
interview. Response times come from the event history. Comparisons are labelled observational and only
highlighted above a minimum sample.

## Security

- bcrypt passwords; JWT with a per-user session version: changing the password signs out every other device.
- Every query is scoped to the authenticated user; cross-user access returns 404 (tested on every endpoint).
- Pydantic validation everywhere; unexpected errors are logged and returned as a generic message.
- AI never executes model-written queries; AI endpoints are rate-limited per user; API keys are never returned.
- Login, register and password forms use POST so credentials never land in a URL, even before hydration.
- The Docker image excludes `.env`, the virtualenv and test databases.
