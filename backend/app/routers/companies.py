import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/", response_model=List[schemas.CompanyOut])
def list_companies(db: Session = Depends(get_db),
                    current_user: models.User = Depends(get_current_user)):
    return (db.query(models.Company)
            .filter(models.Company.owner_id == current_user.id)
            .order_by(models.Company.name.asc())
            .all())


@router.patch("/{company_id}", response_model=schemas.CompanyOut)
def update_company(company_id: uuid.UUID, payload: schemas.CompanyUpdate,
                    db: Session = Depends(get_db),
                    current_user: models.User = Depends(get_current_user)):
    company = db.query(models.Company).filter(
        models.Company.id == company_id,
        models.Company.owner_id == current_user.id,
    ).first()
    if not company:
        raise HTTPException(404, "Company not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company