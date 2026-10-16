from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app import models


def record_event(db: Session, application: models.Application, event_type: models.EventType,
                 from_status: Optional[models.ApplicationStatus] = None,
                 to_status: Optional[models.ApplicationStatus] = None,
                 description: Optional[str] = None,
                 occurred_at: Optional[datetime] = None) -> models.ApplicationEvent:
    """Adds an event to the session; the caller owns the transaction."""
    event = models.ApplicationEvent(
        application_id=application.id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        description=description,
        occurred_at=occurred_at or datetime.utcnow(),
    )
    db.add(event)
    return event
