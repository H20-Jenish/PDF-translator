from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models
from app.config import settings
import httpx

router = APIRouter(prefix="/api/models", tags=["models"])

@router.get("/ollama")
def list_ollama_models(current_user: models.User = Depends(get_current_user)):
    try:
        resp = httpx.get(f"{settings.AI_SERVER_URL.rstrip('/')}/api/tags", timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        return {"models": [m["name"] for m in data.get("models", [])]}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to fetch Ollama models: {str(e)}")