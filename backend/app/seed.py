"""Creates demo accounts with realistic data.

Usage:  python -m app.seed            (re-creates the demo accounts, other users are untouched)
"""
import random
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from app import models
from app.database import SessionLocal
from app.security import hash_password

PASSWORD = "Demo1234!"
S = models.ApplicationStatus

JOBS = [
    ("Shopify", "Backend Developer", "Montreal, QC", "HYBRID", "MID", (110000, 140000),
     ["Ruby on Rails", "Go", "PostgreSQL", "Redis", "Kubernetes"], "LinkedIn"),
    ("Coveo", "Software Developer, Search Platform", "Quebec City, QC", "HYBRID", "MID", (95000, 120000),
     ["Java", "Python", "AWS", "Elasticsearch", "Docker"], "Company website"),
    ("Lightspeed", "Backend Engineer", "Montreal, QC", "HYBRID", "MID", (100000, 125000),
     ["Python", "Django", "PostgreSQL", "AWS", "Docker"], "LinkedIn"),
    ("Hopper", "Software Engineer, Payments", "Remote (Canada)", "REMOTE", "MID", (115000, 145000),
     ["Scala", "Python", "Kafka", "AWS", "Kubernetes"], "Referral"),
    ("Wealthsimple", "Backend Engineer", "Toronto, ON", "REMOTE", "MID", (120000, 150000),
     ["Ruby on Rails", "PostgreSQL", "AWS", "GraphQL"], "LinkedIn"),
    ("Ubisoft", "Online Services Programmer", "Montreal, QC", "ON_SITE", "MID", (85000, 105000),
     ["C#", ".NET", "Azure", "Microservices", "SQL"], "Company website"),
    ("Desjardins", "Développeur Python", "Lévis, QC", "HYBRID", "JUNIOR", (75000, 92000),
     ["Python", "FastAPI", "PostgreSQL", "Docker", "CI/CD"], "Indeed"),
    ("Genetec", "Software Developer - Cloud", "Montreal, QC", "HYBRID", "MID", (95000, 118000),
     ["C#", "Azure", "Kubernetes", "Microservices"], "LinkedIn"),
    ("Cohere", "Software Engineer, Inference", "Toronto, ON", "HYBRID", "SENIOR", (150000, 190000),
     ["Python", "Go", "Kubernetes", "GCP", "LLMs"], "Referral"),
    ("Dialogue", "Full-Stack Developer", "Montreal, QC", "REMOTE", "MID", (95000, 115000),
     ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS"], "Company website"),
    ("Nuvei", "Python Developer", "Montreal, QC", "HYBRID", "MID", (90000, 110000),
     ["Python", "FastAPI", "MySQL", "Docker", "Linux"], "Recruiter"),
    ("Intact", "Data Engineer", "Toronto, ON", "HYBRID", "MID", (100000, 125000),
     ["Python", "Spark", "Airflow", "SQL", "Azure"], "LinkedIn"),
    ("Unity", "Backend Engineer, Services", "Montreal, QC", "HYBRID", "SENIOR", (130000, 160000),
     ["Go", "Kubernetes", "GCP", "gRPC", "PostgreSQL"], "LinkedIn"),
    ("Mila", "Research Software Developer", "Montreal, QC", "ON_SITE", "JUNIOR", (70000, 85000),
     ["Python", "PyTorch", "Linux", "Docker"], "Company website"),
    ("Stripe", "Software Engineer, Backend", "Toronto, ON", "HYBRID", "MID", (140000, 175000),
     ["Ruby", "Java", "AWS", "System Design"], "Referral"),
    ("Datadog", "Software Engineer - Integrations", "Remote", "REMOTE", "MID", (125000, 155000),
     ["Python", "Go", "Docker", "Kubernetes", "Linux"], "LinkedIn"),
    ("National Bank", "Backend Developer, Open Banking", "Montreal, QC", "HYBRID", "MID", (90000, 112000),
     ["Java", "Spring Boot", "PostgreSQL", "Kafka", "REST APIs"], "Indeed"),
    ("CAE", "Software Developer", "Saint-Laurent, QC", "ON_SITE", "JUNIOR", (72000, 88000),
     ["C++", "Python", "Linux", "Git"], "Job fair"),
    ("Mozilla", "Backend Engineer, Firefox Accounts", "Remote", "REMOTE", "MID", (120000, 145000),
     ["Node.js", "TypeScript", "MySQL", "GCP"], "Company website"),
    ("Element", "Platform Engineer", "Montreal, QC", "HYBRID", "MID", (100000, 125000),
     ["Terraform", "AWS", "Kubernetes", "Python", "CI/CD"], "LinkedIn"),
    ("SAP", "Developer, Cloud Platform", "Montreal, QC", "HYBRID", "JUNIOR", (78000, 95000),
     ["Java", "Kubernetes", "SQL", "Agile"], "LinkedIn"),
    ("Morgan Stanley", "Python Developer, Risk", "Montreal, QC", "ON_SITE", "MID", (105000, 130000),
     ["Python", "Pandas", "SQL", "Linux"], "Recruiter"),
    ("Amazon", "Software Development Engineer", "Toronto, ON", "ON_SITE", "MID", (130000, 165000),
     ["Java", "AWS", "System Design", "Microservices"], "Company website"),
    ("Microsoft", "Software Engineer II", "Vancouver, BC", "HYBRID", "MID", (135000, 165000),
     ["C#", "Azure", "Distributed systems", "SQL"], "Referral"),
    ("Snowflake", "Software Engineer, Connectors", "Toronto, ON", "HYBRID", "MID", (140000, 170000),
     ["Java", "Python", "Snowflake", "AWS"], "LinkedIn"),
    ("Busbud", "Full-Stack Engineer", "Montreal, QC", "HYBRID", "MID", (90000, 110000),
     ["Node.js", "React", "MongoDB", "AWS"], "Company website"),
    ("Moment Factory", "Software Developer, Tools", "Montreal, QC", "ON_SITE", "JUNIOR", (68000, 82000),
     ["C++", "Python", "Git"], "Job fair"),
    ("Ada", "Backend Engineer", "Toronto, ON", "REMOTE", "MID", (115000, 140000),
     ["Python", "Django", "PostgreSQL", "Redis", "LLMs"], "LinkedIn"),
    ("Paper", "Backend Developer", "Montreal, QC", "HYBRID", "MID", (95000, 115000),
     ["Python", "Django", "PostgreSQL", "AWS"], "Referral"),
    ("Clio", "Software Developer", "Vancouver, BC", "HYBRID", "MID", (110000, 135000),
     ["Ruby on Rails", "React", "MySQL", "AWS"], "LinkedIn"),
    ("Flinks", "Backend Developer", "Montreal, QC", "HYBRID", "MID", (95000, 120000),
     ["Node.js", "TypeScript", "PostgreSQL", "AWS", "Docker"], "Recruiter"),
    ("Sollum", "Python Developer", "Montreal, QC", "ON_SITE", "JUNIOR", (65000, 80000),
     ["Python", "FastAPI", "Linux"], "Indeed"),
]

# (final status, how far the application went before the final status)
PLAN = ([S.SAVED] * 5 + [S.PREPARING] * 2 + [S.APPLIED] * 9 + [S.RECRUITER_CONTACT] * 3 +
        [S.ASSESSMENT] * 2 + [S.INTERVIEW] * 2 + [S.FINAL_INTERVIEW] * 1 + [S.OFFER] * 1 +
        [S.REJECTED] * 6 + [S.WITHDRAWN] * 1)
PROGRESSION = [S.APPLIED, S.RECRUITER_CONTACT, S.ASSESSMENT, S.INTERVIEW, S.FINAL_INTERVIEW, S.OFFER]


def description(company, title, location, mode, seniority, skills, rng) -> str:
    years = {"JUNIOR": "1+ years", "MID": "3+ years", "SENIOR": "6+ years"}[seniority]
    must, nice = skills[:-1] or skills, skills[-1:]
    mode_text = {"REMOTE": "fully remote within Canada", "HYBRID": "hybrid (2-3 days in the office)",
                 "ON_SITE": "on-site"}[mode]
    responsibilities = rng.sample([
        "Design, build and operate services used by thousands of customers",
        "Own features end to end, from design review to production monitoring",
        "Improve reliability and performance of our APIs",
        "Collaborate with product and design to ship iteratively",
        "Write clean, tested code and review your teammates' work",
        "Take part in the on-call rotation for the services you own",
    ], 4)
    return "\n".join([
        f"{title}",
        f"Company: {company}",
        f"Location: {location}",
        "",
        f"{company} is hiring a {title.lower()} to join a growing engineering team. This role is {mode_text}.",
        "",
        "What you'll do",
        *[f"- {r}" for r in responsibilities],
        "",
        "Requirements",
        f"- {years} of experience in software development",
        f"- Professional experience with {', '.join(must)}",
        "- Bachelor's degree in computer science or equivalent experience",
        "- Fluent in English; French is an asset" if "QC" in location else "- Fluent in English",
        "",
        "Nice to have",
        f"- Experience with {', '.join(nice)}",
        "",
        "Benefits",
        "- Flexible hours and remote-friendly culture",
        "- Annual learning budget",
        "- Health and dental insurance from day one",
    ])


def _wipe(db: Session, email: str):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return
    uid = user.id
    for model in (models.InterviewQuestion, models.QuestionTopic, models.Task, models.Contact):
        db.query(model).filter(model.owner_id == uid).delete(synchronize_session=False)
    pref = db.query(models.CandidatePreference).filter_by(owner_id=uid).first()
    if pref:
        db.delete(pref)
    for skill in db.query(models.Skill).filter_by(owner_id=uid):
        db.delete(skill)
    db.flush()
    for model in (models.Experience, models.Project, models.Education, models.Language):
        db.query(model).filter(model.owner_id == uid).delete(synchronize_session=False)
    for app_obj in db.query(models.Application).filter_by(owner_id=uid):
        db.delete(app_obj)
    db.flush()
    for model in (models.Resume, models.Company):
        db.query(model).filter(model.owner_id == uid).delete(synchronize_session=False)
    db.delete(user)
    db.flush()


def _user(db: Session, email: str, name: str) -> models.User:
    _wipe(db, email)
    user = models.User(email=email, full_name=name, hashed_password=hash_password(PASSWORD),
                       created_at=datetime.utcnow() - timedelta(days=130))
    db.add(user)
    db.flush()
    return user


def _profile_alex(db: Session, user: models.User) -> None:
    ubi = models.Experience(owner_id=user.id, company="Ubisoft", title="Backend Developer Intern",
                            start_date=date(2024, 5, 6), end_date=date(2024, 8, 30),
                            description="Online services team for a live multiplayer game.",
                            achievements="- Built a matchmaking metrics API in Python/FastAPI\n"
                                         "- Cut p95 latency of the leaderboard endpoint by 38%")
    desj = models.Experience(owner_id=user.id, company="Desjardins", title="Software Developer (co-op)",
                             start_date=date(2025, 1, 6), end_date=date(2025, 8, 29),
                             description="Internal tooling for the fraud analytics team.",
                             achievements="- Migrated 14 batch jobs to Docker + GitHub Actions\n"
                                          "- Wrote PostgreSQL reporting queries used weekly by analysts")
    edu = models.Education(owner_id=user.id, institution="Université de Montréal",
                           degree="B.Sc.", field="Computer Science",
                           start_date=date(2022, 9, 1), end_date=date(2026, 5, 1), gpa=3.6)
    p1 = models.Project(owner_id=user.id, name="JobPilot",
                        description="Job search tracker with analytics and an AI assistant. FastAPI, Next.js, PostgreSQL.",
                        repository_url="https://github.com/example/jobpilot")
    p2 = models.Project(owner_id=user.id, name="Transit delay predictor",
                        description="Data pipeline and dashboard over STM open data. Python, Pandas, Airflow.",
                        repository_url="https://github.com/example/stm-delays")
    p3 = models.Project(owner_id=user.id, name="Distributed key-value store",
                        description="Course project: Raft-based replicated store in Go.")
    db.add_all([ubi, desj, edu, p1, p2, p3])
    db.flush()

    E = models.EvidenceType
    skills = [
        ("Python", "Languages", "ADVANCED", 3, [(E.EXPERIENCE, ubi, "Built matchmaking metrics API"),
                                               (E.PROJECT, p1, "Whole backend of JobPilot")]),
        ("FastAPI", "Backend", "ADVANCED", 2, [(E.EXPERIENCE, ubi, "Main framework of the metrics API"),
                                               (E.PROJECT, p1, "API layer")]),
        ("PostgreSQL", "Data", "INTERMEDIATE", 2, [(E.EXPERIENCE, desj, "Reporting queries for analysts")]),
        ("Docker", "DevOps", "INTERMEDIATE", 2, [(E.EXPERIENCE, desj, "Containerised 14 batch jobs")]),
        ("GitHub Actions", "DevOps", "INTERMEDIATE", 1, [(E.EXPERIENCE, desj, "CI pipelines for batch jobs")]),
        ("TypeScript", "Languages", "INTERMEDIATE", 1, [(E.PROJECT, p1, "Next.js frontend")]),
        ("React", "Frontend", "INTERMEDIATE", 1, [(E.PROJECT, p1, "Dashboard UI")]),
        ("Go", "Languages", "BEGINNER", 0.5, [(E.PROJECT, p3, "Raft implementation")]),
        ("Pandas", "Data", "INTERMEDIATE", 1, [(E.PROJECT, p2, "Cleaning STM open data")]),
        ("Airflow", "Data", "BEGINNER", 0.5, [(E.PROJECT, p2, "Daily ingestion DAG")]),
        ("AWS", "Cloud", "BEGINNER", 0.5, []),
        ("Kubernetes", "DevOps", "BEGINNER", None, []),
        ("Java", "Languages", "INTERMEDIATE", 2, [(E.EDUCATION, edu, "Data structures and OOP courses")]),
        ("SQL", "Data", "ADVANCED", 3, [(E.EXPERIENCE, desj, "Weekly analyst reports")]),
    ]
    for name, category, prof, years, evidences in skills:
        skill = models.Skill(owner_id=user.id, name=name, category=category,
                             proficiency=models.SkillProficiency(prof), years_experience=years)
        db.add(skill)
        db.flush()
        for ev_type, source, text in evidences:
            db.add(models.SkillEvidence(
                skill_id=skill.id, evidence_type=ev_type, description=text,
                confidence=models.EvidenceConfidence.HIGH,
                source_experience_id=source.id if ev_type == E.EXPERIENCE else None,
                source_project_id=source.id if ev_type == E.PROJECT else None,
                source_education_id=source.id if ev_type == E.EDUCATION else None))

    db.add_all([models.Language(owner_id=user.id, language="French",
                                proficiency=models.LanguageProficiency.NATIVE),
                models.Language(owner_id=user.id, language="English",
                                proficiency=models.LanguageProficiency.FLUENT)])
    pref = models.CandidatePreference(owner_id=user.id, remote_preference=models.WorkMode.HYBRID,
                                      desired_employment_type=models.EmploymentType.FULL_TIME,
                                      salary_expectation_min=90000, salary_expectation_max=125000)
    db.add(pref)
    db.flush()
    db.add_all([models.PreferredLocation(preference_id=pref.id, location=loc)
                for loc in ("Montreal", "Remote", "Toronto")])
    db.add_all([models.DesiredRole(preference_id=pref.id, role=role)
                for role in ("Backend Engineer", "Platform Engineer")])


def _applications(db: Session, user: models.User, rng: random.Random, jobs, plan, resumes) -> list:
    created = []
    company_cache: dict[str, models.Company] = {}
    now = datetime.utcnow()
    rng.shuffle(plan)
    for i, ((company, title, location, mode, seniority, salary, skills, source), final) in \
            enumerate(zip(jobs, plan)):
        company_obj = company_cache.get(company)
        if not company_obj:
            company_obj = models.Company(owner_id=user.id, name=company)
            db.add(company_obj)
            db.flush()
            company_cache[company] = company_obj

        # Walk the pipeline up to the final status with realistic gaps
        path: list[models.ApplicationStatus] = []
        if final == S.PREPARING:
            path = [S.PREPARING]
        elif final in PROGRESSION:
            path = PROGRESSION[:PROGRESSION.index(final) + 1]
        elif final == S.REJECTED:
            path = PROGRESSION[:rng.choice([1, 1, 1, 2, 3, 4])] + [S.REJECTED]
        elif final == S.WITHDRAWN:
            path = [S.APPLIED, S.RECRUITER_CONTACT, S.WITHDRAWN]
        gaps = [timedelta(days=1 if step == S.APPLIED else rng.randint(3, 12), hours=rng.randint(1, 8))
                for step in path]

        # A few recent saves so "applied this week" has data; long paths need an older start
        days_ago = rng.randint(2, 9) if i % 6 == 0 else rng.randint(4, 118)
        span = sum(gaps, timedelta())
        saved_at = now - timedelta(days=days_ago, hours=rng.randint(0, 10))
        if saved_at + span > now - timedelta(days=1):
            saved_at = now - span - timedelta(days=rng.randint(1, 35), hours=rng.randint(0, 10))
        app_obj = models.Application(
            owner_id=user.id, company_id=company_obj.id, position_title=title,
            job_description=description(company, title, location, mode, seniority, skills, rng),
            job_url=f"https://careers.example.com/{company.lower().replace(' ', '-')}/{i + 100}",
            salary_min=salary[0], salary_max=salary[1], currency="CAD", location=location,
            work_mode=models.WorkMode(mode), employment_type=models.EmploymentType.FULL_TIME,
            seniority=models.SeniorityLevel(seniority), source=source, status=S.SAVED,
            date_saved=saved_at, created_at=saved_at, updated_at=saved_at)
        db.add(app_obj)
        db.flush()
        db.add(models.ApplicationEvent(application_id=app_obj.id, event_type=models.EventType.CREATED,
                                       to_status=S.SAVED, occurred_at=saved_at))

        t, previous = saved_at, S.SAVED
        for step, gap in zip(path, gaps):
            t = min(t + gap, now - timedelta(hours=2))
            db.add(models.ApplicationEvent(application_id=app_obj.id,
                                           event_type=models.EventType.STATUS_CHANGED,
                                           from_status=previous, to_status=step, occurred_at=t))
            if step == S.APPLIED:
                app_obj.applied_date = t
            previous = step
        app_obj.status = previous
        app_obj.updated_at = t

        if app_obj.status == S.REJECTED:
            app_obj.rejection_reason = rng.choice(
                [models.RejectionReason.UNKNOWN] * 3 + [models.RejectionReason.EXPERIENCE] * 2 +
                [models.RejectionReason.ASSESSMENT, models.RejectionReason.LOCATION])
        if app_obj.status in (S.SAVED, S.PREPARING):
            app_obj.deadline = (now + timedelta(days=rng.randint(3, 20))).date()

        if app_obj.status != S.SAVED and resumes:
            # Observational demo data: the v2 resume ends up associated with more responses
            responded = app_obj.status.value not in ("APPLIED", "REJECTED", "PREPARING") or \
                (app_obj.status == S.REJECTED and len(path) > 2)
            if len(resumes) == 1:
                app_obj.resume_id = resumes[0].id
            elif "Full-Stack" in title and len(resumes) > 2:
                app_obj.resume_id = resumes[2].id
            else:
                favoured = resumes[1] if responded else resumes[0]
                other = resumes[0] if responded else resumes[1]
                app_obj.resume_id = (favoured if rng.random() < 0.7 else other).id

        if rng.random() < 0.6:
            db.add(models.ApplicationTag(application_id=app_obj.id,
                                         tag=rng.choice(["dream-job", "backend", "fintech", "gaming",
                                                         "remote", "startup", "big-tech"])))
        created.append(app_obj)
    return created


def _interviews(db: Session, apps, rng: random.Random):
    now = datetime.utcnow()
    upcoming_slots = [now + timedelta(days=d, hours=h) for d, h in ((1, 2), (3, 5), (6, 1), (9, 4))]
    types = {S.RECRUITER_CONTACT: "Recruiter screen", S.ASSESSMENT: "Coding",
             S.INTERVIEW: "Technical", S.FINAL_INTERVIEW: "Final", S.OFFER: "Hiring manager"}
    for app_obj in apps:
        reached = [e.to_status for e in app_obj.events if e.to_status]
        for status, label in types.items():
            if status not in reached:
                continue
            event = next(e for e in app_obj.events if e.to_status == status)
            is_current = app_obj.status == status and status in (S.INTERVIEW, S.FINAL_INTERVIEW,
                                                                  S.ASSESSMENT)
            upcoming = is_current and bool(upcoming_slots)
            when = upcoming_slots.pop(0) if upcoming else event.occurred_at + timedelta(days=rng.randint(1, 3))
            # Business hours in Montreal (UTC-4/-5): 13:00-20:00 UTC
            when = when.replace(hour=rng.choice([13, 14, 15, 17, 18, 19]), minute=rng.choice([0, 30]),
                                second=0, microsecond=0)
            if not upcoming and when >= now:
                # Past stages must stay in the past
                when = (now - timedelta(days=1)).replace(hour=15, minute=0, second=0, microsecond=0)
            db.add(models.Interview(
                application_id=app_obj.id, scheduled_at=when, interview_type=label,
                location_or_link="https://meet.google.com/abc-defg-hij" if rng.random() < 0.7
                else f"{app_obj.company_name} office",
                interviewer=rng.choice(["Julie Tremblay", "Marc Gagnon", "Priya Shah", "David Chen", None]),
                duration_minutes=rng.choice([30, 45, 60]),
                stage=label, self_assessment=rng.randint(2, 5) if when < now else None,
                outcome=("PASSED" if when < now and app_obj.status != S.REJECTED else
                         "FAILED" if when < now else "PENDING"),
                reminder_sent=when < now))
            db.add(models.ApplicationEvent(application_id=app_obj.id,
                                           event_type=models.EventType.INTERVIEW_SCHEDULED,
                                           description=f"{label} on {when:%b %d, %Y}",
                                           occurred_at=min(event.occurred_at + timedelta(hours=1), now)))


QUESTIONS = [
    ("System Design", "Design a URL shortener that handles 10k writes per second.", 4),
    ("System Design", "How would you design the leaderboard for a mobile game?", 4),
    ("System Design", "Design a rate limiter for a public API.", 3),
    ("System Design", "How would you shard a multi-tenant PostgreSQL database?", 5),
    ("SQL", "Find the second highest salary per department.", 3),
    ("SQL", "Explain the difference between a clustered and a non-clustered index.", 2),
    ("SQL", "When would you denormalize a schema?", 3),
    ("Python", "What is the GIL and when does it matter?", 3),
    ("Python", "Explain generators and when you would use them.", 2),
    ("Python", "How does FastAPI dependency injection work?", 2),
    ("Algorithms", "Merge k sorted lists.", 4),
    ("Algorithms", "Find the longest substring without repeating characters.", 3),
    ("Algorithms", "Detect a cycle in a directed graph.", 3),
    ("Behavioral", "Tell me about a time you disagreed with a teammate.", 2),
    ("Behavioral", "Describe a project you are proud of.", 1),
    ("Behavioral", "Tell me about a production incident you handled.", 3),
    ("Cloud", "How would you deploy this service on AWS with zero downtime?", 4),
    ("Cloud", "What is the difference between an ALB and an NLB?", 3),
    ("DevOps", "How do Kubernetes readiness and liveness probes differ?", 4),
    ("Databases", "What isolation level does PostgreSQL use by default?", 3),
]


def _questions(db: Session, user: models.User, apps, rng: random.Random):
    topics = {}
    for name in ("Algorithms", "Data Structures", "Python", "Java", "JavaScript", "SQL", "Databases",
                 "Networking", "System Design", "Behavioral", "Cloud", "DevOps"):
        topic = models.QuestionTopic(owner_id=user.id, name=name)
        db.add(topic)
        topics[name] = topic
    db.flush()
    interviewed = [a for a in apps if a.interviews] or apps
    today = date.today()
    for i, (topic, question, difficulty) in enumerate(QUESTIONS):
        app_obj = interviewed[i % len(interviewed)]
        asked = today - timedelta(days=90 - i * 4)
        # Confidence improves over time for SQL/Python, stays low for system design
        base = {"System Design": 2, "Cloud": 2, "DevOps": 2, "SQL": 3, "Python": 4,
                "Behavioral": 4}.get(topic, 3)
        trend = (i // 6) if topic in ("SQL", "Python", "Algorithms") else 0
        db.add(models.InterviewQuestion(
            owner_id=user.id, application_id=app_obj.id, topic_id=topics[topic].id,
            question=question, company=app_obj.company_name, role=app_obj.position_title,
            interview_type="Behavioral" if topic == "Behavioral" else "Technical",
            asked_date=asked, difficulty=difficulty, confidence=max(1, min(5, base + trend - rng.randint(0, 1))),
            user_answer="Walked through requirements, data model, then scaling and failure modes."
            if topic == "System Design" else None,
            notes="Review consistent hashing and queue back-pressure." if topic == "System Design" else None))


def _network(db: Session, user: models.User, apps, rng: random.Random):
    by_company = {a.company_name: a for a in apps}
    today = date.today()
    people = [
        ("Sarah Lavoie", "Shopify", "Technical Recruiter", "RECRUITER", -2, -9),
        ("John Park", "Hopper", "Senior Engineer", "REFERRAL", 0, -21),
        ("Émilie Roy", "Coveo", "Engineering Manager", "HIRING_MANAGER", 4, -6),
        ("David Chen", "Cohere", "Software Engineer", "ALUMNI", 9, -30),
        ("Nadia Benali", "Desjardins", "Former manager", "MENTOR", -5, -40),
        ("Kevin O'Brien", "Wealthsimple", "Talent Partner", "RECRUITER", None, -15),
    ]
    contacts = []
    for name, company, role, rel, follow_in, last_ago in people:
        app_obj = by_company.get(company)
        company_obj = app_obj.company if app_obj else None
        contact = models.Contact(
            owner_id=user.id, name=name, company_id=company_obj.id if company_obj else None,
            role=role, relationship_type=models.RelationshipType(rel),
            email=f"{name.split()[0].lower()}@example.com",
            linkedin_url=f"https://www.linkedin.com/in/{name.lower().replace(' ', '-').replace('é', 'e')}",
            last_interaction_at=today + timedelta(days=last_ago),
            next_follow_up_at=today + timedelta(days=follow_in) if follow_in is not None else None,
            notes=rng.choice(["Met at the Montreal Python meetup.", "Very responsive on LinkedIn.",
                              "Offered to refer me for the next opening.", "Prefers email over LinkedIn."]),
            applications=[app_obj] if app_obj else [])
        db.add(contact)
        contacts.append(contact)
    db.flush()

    open_apps = [a for a in apps if a.status in (S.APPLIED, S.RECRUITER_CONTACT, S.INTERVIEW)]
    tasks = [
        ("Send thank-you note after technical interview", models.TaskKind.FOLLOW_UP, 0, open_apps[0] if open_apps else None, None),
        ("Follow up on application status", models.TaskKind.FOLLOW_UP, -1, open_apps[1] if len(open_apps) > 1 else None, None),
        ("Review system design notes (sharding, queues)", models.TaskKind.PREPARATION, 2, None, None),
        ("Ask Nadia for a reference letter", models.TaskKind.NETWORKING, 5, None, contacts[4]),
        ("Tailor resume for platform roles", models.TaskKind.OTHER, 7, None, None),
        ("Update LinkedIn headline", models.TaskKind.OTHER, -10, None, None),
    ]
    for i, (title, kind, due_in, app_obj, contact) in enumerate(tasks):
        db.add(models.Task(owner_id=user.id, title=title, kind=kind,
                           due_date=today + timedelta(days=due_in),
                           application_id=app_obj.id if app_obj else None,
                           contact_id=contact.id if contact else None,
                           completed_at=datetime.utcnow() - timedelta(days=8) if i == 5 else None))


def seed_alex(db: Session):
    rng = random.Random(42)
    user = _user(db, "alex@jobpilot.dev", "Alex Martin")
    _profile_alex(db, user)
    resumes = [
        models.Resume(owner_id=user.id, name="Backend Engineer", version="v1", target_role="Backend Engineer",
                      notes="Original one-page resume.", created_at=datetime.utcnow() - timedelta(days=125)),
        models.Resume(owner_id=user.id, name="Backend Engineer", version="v2", target_role="Backend Engineer",
                      notes="Rewrote bullets with measurable impact; moved projects above education.",
                      created_at=datetime.utcnow() - timedelta(days=80)),
        models.Resume(owner_id=user.id, name="Full-Stack", version="v1", target_role="Full-Stack Developer",
                      notes="Highlights the Next.js side of JobPilot.",
                      created_at=datetime.utcnow() - timedelta(days=60)),
    ]
    db.add_all(resumes)
    db.flush()
    apps = _applications(db, user, rng, JOBS, list(PLAN), resumes)
    db.flush()
    for a in apps:
        db.refresh(a)
    _interviews(db, apps, rng)
    db.flush()
    _questions(db, user, apps, rng)
    _network(db, user, apps, rng)


def seed_sam(db: Session):
    rng = random.Random(7)
    user = _user(db, "sam@jobpilot.dev", "Sam Rivera")
    data_jobs = [
        ("Intact", "Data Analyst", "Toronto, ON", "HYBRID", "JUNIOR", (68000, 82000),
         ["SQL", "Python", "Tableau", "Power BI"], "LinkedIn"),
        ("Desjardins", "Analyste de données", "Montreal, QC", "HYBRID", "JUNIOR", (65000, 78000),
         ["SQL", "Power BI", "Python"], "Indeed"),
        ("Hopper", "Data Scientist", "Remote (Canada)", "REMOTE", "MID", (105000, 130000),
         ["Python", "Pandas", "Machine Learning", "SQL", "Airflow"], "LinkedIn"),
        ("Shopify", "Data Analyst, Merchant Growth", "Remote (Canada)", "REMOTE", "MID", (90000, 110000),
         ["SQL", "dbt", "Python", "BigQuery"], "Company website"),
        ("Lightspeed", "BI Developer", "Montreal, QC", "HYBRID", "MID", (85000, 100000),
         ["SQL", "Snowflake", "dbt", "Tableau"], "Recruiter"),
        ("Coveo", "Data Engineer", "Quebec City, QC", "HYBRID", "JUNIOR", (80000, 95000),
         ["Python", "Spark", "AWS", "Airflow"], "LinkedIn"),
        ("Ubisoft", "Data Analyst, Player Insights", "Montreal, QC", "ON_SITE", "JUNIOR", (62000, 75000),
         ["SQL", "Python", "Tableau"], "Company website"),
        ("Wealthsimple", "Analytics Engineer", "Toronto, ON", "REMOTE", "MID", (100000, 125000),
         ["SQL", "dbt", "Snowflake", "Python"], "Referral"),
        ("National Bank", "Data Analyst, Risk", "Montreal, QC", "HYBRID", "JUNIOR", (66000, 80000),
         ["SQL", "Python", "Pandas"], "Job fair"),
        ("Element", "Junior Data Scientist", "Montreal, QC", "HYBRID", "JUNIOR", (75000, 90000),
         ["Python", "scikit-learn", "SQL"], "LinkedIn"),
        ("Dialogue", "Product Analyst", "Montreal, QC", "REMOTE", "MID", (85000, 100000),
         ["SQL", "Python", "BigQuery"], "Company website"),
        ("Unity", "Data Analyst", "Montreal, QC", "HYBRID", "MID", (88000, 105000),
         ["SQL", "Python", "Tableau", "Spark"], "LinkedIn"),
    ]
    plan = [S.SAVED, S.SAVED, S.APPLIED, S.APPLIED, S.APPLIED, S.APPLIED, S.RECRUITER_CONTACT,
            S.ASSESSMENT, S.INTERVIEW, S.REJECTED, S.REJECTED, S.REJECTED]
    resume = models.Resume(owner_id=user.id, name="Data Analyst", version="v1", target_role="Data Analyst")
    db.add(resume)
    db.flush()
    apps = _applications(db, user, rng, data_jobs, plan, [resume])
    db.flush()
    for a in apps:
        db.refresh(a)
    _interviews(db, apps, rng)
    for name, category in (("SQL", "Data"), ("Python", "Languages"), ("Tableau", "Data"),
                           ("Pandas", "Data"), ("Power BI", "Data")):
        db.add(models.Skill(owner_id=user.id, name=name, category=category,
                            proficiency=models.SkillProficiency.INTERMEDIATE))
    db.add(models.Experience(owner_id=user.id, company="Statistics Canada", title="Data Analyst Intern",
                             start_date=date(2025, 5, 1), end_date=date(2025, 8, 31),
                             description="Cleaned and documented census datasets."))


def seed_empty(db: Session):
    _user(db, "new@jobpilot.dev", "Jordan Lee")


def main():
    db = SessionLocal()
    try:
        seed_alex(db)
        seed_sam(db)
        seed_empty(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print("Demo accounts ready (password for all: %s)" % PASSWORD)
    print("  alex@jobpilot.dev  - backend developer, ~4 months of history")
    print("  sam@jobpilot.dev   - data analyst, smaller dataset")
    print("  new@jobpilot.dev   - empty account (onboarding / empty states)")


if __name__ == "__main__":
    main()
