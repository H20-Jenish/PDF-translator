from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://pdfuser:pdfpass@db:5432/pdftranslator"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "change-me"
    AI_SERVER_URL: str = "http://ollama:11434"
    AI_MODEL: str = "translategemma:12b"   # Updated default
    OLLAMA_API_KEY: str = ""               # Empty by default
    UPLOAD_DIR: str = "./uploads"
    OUTPUT_DIR: str = "./outputs"

    class Config:
        env_file = ".env"

settings = Settings()