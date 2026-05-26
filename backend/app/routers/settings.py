from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("/", response_model=schemas.SettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    setting = db.query(models.UserSetting).filter(
        models.UserSetting.user_id == current_user.id
    ).first()
    if not setting:
        setting = models.UserSetting(user_id=current_user.id)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting

@router.put("/", response_model=schemas.SettingsOut)
def update_settings(
    update: schemas.SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    setting = db.query(models.UserSetting).filter(
        models.UserSetting.user_id == current_user.id
    ).first()
    if not setting:
        setting = models.UserSetting(user_id=current_user.id)
        db.add(setting)
    
    if update.ai_server_url is not None:
        setting.ai_server_url = update.ai_server_url
    if update.ai_model_name is not None:
        setting.ai_model_name = update.ai_model_name
    if update.api_key is not None:
        setting.api_key = update.api_key
    
    db.commit()
    db.refresh(setting)
    return setting