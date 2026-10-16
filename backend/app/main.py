import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.scheduler import start_scheduler, scheduler
from app.routers import (auth, applications, calendar, stats, companies, profile,
                          matching, interviews, interview_questions, resumes, analytics,
                          contacts, tasks, dashboard, search, insights, jobs, assistant, ai)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("jobpilot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is managed by Alembic: run `alembic upgrade head` before starting.
    start_scheduler()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="JobPilot API", lifespan=lifespan)


@app.middleware("http")
async def unexpected_errors(request: Request, call_next):
    """Logs unexpected errors server-side and returns a generic message (no stack traces)."""
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500,
                            content={"detail": "Something went wrong on our side. Please try again."})


# Added last so it wraps the error middleware: error responses keep their CORS headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted({settings.FRONTEND_URL, "http://localhost:4300", "http://127.0.0.1:4300"}),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, dashboard, applications, matching, companies, contacts, tasks,
               calendar, stats, profile, interviews, interview_questions, resumes, analytics,
               insights, search, jobs, assistant, ai):
    app.include_router(module.router)


@app.get("/health")
def health():
    return {"status": "ok"}
