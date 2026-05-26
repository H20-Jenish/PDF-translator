import os
from datetime import datetime
from celery import Celery
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.database import engine
from app import models
from app.services.pdf_processor import PDFProcessor
from app.services.translator import TranslatorService
from app.services.pdf_builder import PDFBuilder

celery_app = Celery("tasks", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@celery_app.task(bind=True, max_retries=3)
def process_document(self, document_id: int):
    db = SessionLocal()
    try:
        doc = db.query(models.Document).filter(models.Document.id == document_id).first()
        if not doc:
            return
        
        doc.status = "processing"
        db.commit()
        db.refresh(doc)  # Push status immediately
        
        user_settings = db.query(models.UserSetting).filter(
            models.UserSetting.user_id == doc.user_id
        ).first()
        
        server_url = user_settings.ai_server_url if user_settings else None
        model = user_settings.ai_model_name if user_settings else None
        api_key = user_settings.api_key if user_settings else None
        
        file_path = os.path.join(settings.UPLOAD_DIR, doc.stored_filename)
        output_path = os.path.join(settings.OUTPUT_DIR, f"translated_{doc.stored_filename}")
        os.makedirs(settings.OUTPUT_DIR, exist_ok=True)

        # Select Tesseract language pack for OCR.
        # Every page is now rasterised and OCR'd regardless of source type,
        # so an accurate language pack is always important.
        # Fall back to a broad Indic+English pack when detection was inconclusive.
        if doc.source_language and doc.source_language not in ("unknown", "auto", ""):
            ocr_lang = doc.source_language
        else:
            ocr_lang = "guj+hin+ben+tam+tel+mar+eng"
        
        processor = PDFProcessor(file_path, ocr_language=ocr_lang)
        content = processor.extract_content()
        processor.close()
        
        doc.page_count = content["page_count"]
        doc.processed_pages = 0
        db.commit()
        db.refresh(doc)  # Push total pages immediately
        
        lang_names = {
            "ben": "Bengali", "eng": "English", "hin": "Hindi", "guj": "Gujarati",
            "tam": "Tamil", "tel": "Telugu", "mar": "Marathi", "urd": "Urdu",
            "spa": "Spanish", "fra": "French", "deu": "German", "ara": "Arabic",
            "zho": "Chinese", "jpn": "Japanese", "kor": "Korean", "rus": "Russian",
            "por": "Portuguese", "ita": "Italian", "nld": "Dutch", "tur": "Turkish",
            "vie": "Vietnamese", "tha": "Thai", "pol": "Polish", "ukr": "Ukrainian",
        }
        target_lang_name = lang_names.get(doc.target_language, "Bengali")
        
        translator = TranslatorService(server_url, model, api_key)
        builder = PDFBuilder(file_path, output_path, target_language=doc.target_language)
        
        for i, page in enumerate(content["pages"]):
            translated_blocks = translator.translate_blocks(page["text_blocks"], target_lang_name)
            page["text_blocks"] = translated_blocks
            
            # Immediately push page progress to the frontend
            doc.processed_pages = i + 1
            db.commit()
            db.refresh(doc)
        
        builder.apply_translations(content["pages"])
        builder.build()
        
        doc.translated_filename = f"translated_{doc.stored_filename}"
        doc.status = "completed"
        doc.completed_date = datetime.utcnow()
        db.commit()
        
    except Exception as exc:
        db.rollback()
        doc = db.query(models.Document).filter(models.Document.id == document_id).first()
        if doc:
            doc.status = "failed"
            doc.error_message = str(exc)
            db.commit()
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()