from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False)
    status = Column(String, default="pending")
    source_language = Column(String, default="auto")
    target_language = Column(String, default="ben")
    page_count = Column(Integer, nullable=True)
    processed_pages = Column(Integer, default=0)
    task_id = Column(String, nullable=True)  
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    completed_date = Column(DateTime(timezone=True), nullable=True)
    translated_filename = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)

class UserSetting(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    ai_server_url = Column(String, default="http://ollama:11434")
    ai_model_name = Column(String, default="translategemma:12b")
    api_key = Column(String, nullable=True)