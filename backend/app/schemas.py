from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class DocumentOut(BaseModel):
    id: int
    original_filename: str
    status: str
    source_language: Optional[str] = None
    target_language: Optional[str] = None
    page_count: Optional[int] = None
    processed_pages: Optional[int] = None  # NEW
    upload_date: datetime
    completed_date: Optional[datetime] = None
    translated_filename: Optional[str] = None
    error_message: Optional[str] = None
    class Config:
        from_attributes = True

class SettingsUpdate(BaseModel):
    ai_server_url: Optional[str] = None
    ai_model_name: Optional[str] = None
    api_key: Optional[str] = None

class SettingsOut(BaseModel):
    ai_server_url: str
    ai_model_name: str
    api_key: Optional[str] = None
    class Config:
        from_attributes = True