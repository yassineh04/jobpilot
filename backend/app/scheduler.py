import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from app.database import SessionLocal
from app import models
from app.email_utils import send_email

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

def check_upcoming_interviews():
    db = SessionLocal()
    try:
        window_start = datetime.utcnow()
        window_end = window_start + timedelta(hours=24)
        upcoming_interviews = (
            db.query(models.Interview)
            .join(models.Application)
            .join(models.User)
            .filter(models.Interview.scheduled_at.between(window_start, window_end))
            .filter(models.Interview.reminder_sent == False)
            .filter(models.User.email_reminders == True)
            .all()
        )

        for interview in upcoming_interviews:
            app_obj = interview.application
            user = app_obj.owner
            try:
                sent = send_email(
                    to_email=user.email,
                    subject=f"Upcoming Interview Reminder - {app_obj.company_name}",
                    body=f"Hi {user.full_name or user.email},\n\nReminder: you have an interview on {interview.scheduled_at:%A %B %d at %H:%M} (UTC) for {app_obj.position_title} at {app_obj.company_name}.\n\nYou can turn these emails off in JobPilot settings.\n\nJobPilot",
                )
            except Exception:
                logger.exception("Failed to send reminder for interview %s", interview.id)
                continue
            if sent:
                interview.reminder_sent = True
        db.commit()
    finally:
        db.close()

def start_scheduler():
    scheduler.add_job(check_upcoming_interviews, 'interval', hours=1)
    scheduler.start()