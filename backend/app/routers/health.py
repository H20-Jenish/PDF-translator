from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models
from app.config import settings
import httpx
import redis

router = APIRouter(prefix="/api/health", tags=["health"])

def check_ollama():
    try:
        resp = httpx.get(f"{settings.AI_SERVER_URL.rstrip('/')}/api/tags", timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            models_list = [m["name"] for m in data.get("models", [])]
            return {"status": "healthy", "models": models_list, "message": f"{len(models_list)} models available"}
        return {"status": "unhealthy", "models": [], "message": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"status": "offline", "models": [], "message": str(e)}

@router.get("/services")
def services_health(current_user: models.User = Depends(get_current_user)):
    # Database check - use proper session context
    db_status = "healthy"
    db = None
    try:
        db = next(get_db())
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
    finally:
        if db:
            db.close()
    
    # Redis check
    redis_status = "healthy"
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
    except Exception as e:
        redis_status = f"unhealthy: {str(e)}"
    
    # Ollama check
    ollama = check_ollama()
    
    # Celery check (via Redis broker)
    celery_status = "healthy" if redis_status == "healthy" else "unhealthy"
    
    return {
        "services": [
            {"name": "PostgreSQL", "type": "database", "status": db_status, "icon": "database"},
            {"name": "Redis", "type": "cache", "status": redis_status, "icon": "layers"},
            {"name": "Ollama AI", "type": "ai", "status": ollama["status"], "message": ollama["message"], "icon": "brain"},
            {"name": "Celery Worker", "type": "worker", "status": celery_status, "icon": "cpu"},
            {"name": "Backend API", "type": "api", "status": "healthy", "icon": "server"},
        ],
        "ollama_models": ollama["models"]
    }