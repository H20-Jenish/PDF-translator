import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.auth import decode_token
from app import models, schemas
from app.config import settings
from app.tasks import celery_app

router = APIRouter(prefix="/api/documents", tags=["documents"])

def get_user_from_token(token: str, db: Session):
    user_id = decode_token(token)
    if user_id is None:
        return None
    return db.query(models.User).filter(models.User.id == user_id).first()

@router.get("/", response_model=list[schemas.DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    docs = db.query(models.Document).filter(
        models.Document.user_id == current_user.id
    ).order_by(models.Document.upload_date.desc()).all()
    return docs

@router.get("/{doc_id}/download")
def download_document(
    doc_id: int,
    token: str = Query(None),
    db: Session = Depends(get_db)
):
    user = None
    if token:
        user = get_user_from_token(token, db)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated. Use ?token=JWT")
    
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id,
        models.Document.user_id == user.id
    ).first()
    if not doc or not doc.translated_filename:
        raise HTTPException(status_code=404, detail="Document not found or not ready")
    
    file_path = os.path.join(settings.OUTPUT_DIR, doc.translated_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # FIX: Explicit inline header prevents the auto-download bug in the iframe
    headers = {
        "Content-Disposition": f'inline; filename="translated_{doc.original_filename}"'
    }
    
    return FileResponse(
        file_path,
        media_type="application/pdf",
        headers=headers
    )

@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id,
        models.Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if doc.status in ["pending", "processing"] and doc.task_id:
        celery_app.control.revoke(doc.task_id, terminate=True)
        
    if doc.stored_filename:
        file_path = os.path.join(settings.UPLOAD_DIR, doc.stored_filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            
    if doc.translated_filename:
        out_path = os.path.join(settings.OUTPUT_DIR, doc.translated_filename)
        if os.path.exists(out_path):
            os.remove(out_path)
            
    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}

@router.post("/{doc_id}/cancel")
def cancel_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id,
        models.Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.status in ["pending", "processing"]:
        if doc.task_id:
            celery_app.control.revoke(doc.task_id, terminate=True)
        doc.status = "failed"
        doc.error_message = "Cancelled by user"
        db.commit()
        
    return {"message": "Task cancelled successfully"}