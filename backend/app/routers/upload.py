import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas
from app.config import settings
from app.tasks import process_document
import fitz

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".pdf"}
MAX_FILE_SIZE = 100 * 1024 * 1024 

SUPPORTED_LANGUAGES = {
    "auto": "Auto-detect", "eng": "English", "ben": "Bengali", "hin": "Hindi",
    "guj": "Gujarati", "tam": "Tamil", "tel": "Telugu", "mar": "Marathi",
    "urd": "Urdu", "spa": "Spanish", "fra": "French", "deu": "German",
    "ara": "Arabic", "zho": "Chinese", "jpn": "Japanese", "kor": "Korean",
    "rus": "Russian", "por": "Portuguese", "ita": "Italian", "nld": "Dutch",
    "tur": "Turkish", "vie": "Vietnamese", "tha": "Thai", "pol": "Polish",
    "ukr": "Ukrainian",
}

def detect_pdf_language(file_path: str) -> str:
    """
    Detect the primary language of a PDF.

    Strategy (fast → slow):
    1. Extract embedded text with PyMuPDF and run a Unicode block heuristic.
    2. If the embedded text is too short or mostly ASCII (scanned / legacy-font
       PDFs), render the first few pages as images and OCR them with a broad
       multi-language Tesseract pack, then re-run the heuristic.
    3. Fall back to langdetect for Latin-script languages.
    """
    try:
        from langdetect import detect, DetectorFactory
        import pytesseract
        from PIL import Image, ImageOps
        import io

        DetectorFactory.seed = 0

        doc = fitz.open(file_path)

        # ── Step 1: try embedded text ────────────────────────────────────────
        text = ""
        for page_num in range(min(3, len(doc))):
            text += doc.load_page(page_num).get_text()

        def _unicode_heuristic(t: str):
            """Return a Tesseract language code if a dominant Indic block is found."""
            indic = {
                "guj": sum(1 for c in t if '\u0A80' <= c <= '\u0AFF'),
                "ben": sum(1 for c in t if '\u0980' <= c <= '\u09FF'),
                "hin": sum(1 for c in t if '\u0900' <= c <= '\u097F'),
                "mar": sum(1 for c in t if '\u0900' <= c <= '\u097F'),
                "tam": sum(1 for c in t if '\u0B80' <= c <= '\u0BFF'),
                "tel": sum(1 for c in t if '\u0C00' <= c <= '\u0C7F'),
                "urd": sum(1 for c in t if '\u0600' <= c <= '\u06FF'),
                "ara": sum(1 for c in t if '\u0600' <= c <= '\u06FF'),
            }
            best_lang = max(indic, key=indic.get)
            if indic[best_lang] > 15:
                return best_lang
            return None

        lang = _unicode_heuristic(text)
        if lang:
            doc.close()
            return lang

        # ── Step 2: OCR fallback for scanned / legacy-font PDFs ─────────────
        # Trigger when the embedded text is too short or dominated by ASCII
        # (which means the real content is either scanned or in a non-unicode font)
        needs_ocr = (
            len(text.strip()) < 50
            or (len(text) > 0 and sum(1 for c in text if ord(c) < 128) / len(text) > 0.70)
        )

        if needs_ocr:
            ocr_text = ""
            # Broad pack covering the most common Indian scripts + English
            tess_langs = "guj+hin+ben+tam+tel+mar+eng"
            for page_num in range(min(3, len(doc))):
                page = doc.load_page(page_num)
                pix = page.get_pixmap(dpi=200)
                img = ImageOps.grayscale(Image.open(io.BytesIO(pix.tobytes("png"))))

                # Fast script detection first (robust for scanned pages).
                # OSD output example contains: "Script: Gujarati"
                try:
                    osd = pytesseract.image_to_osd(img)
                    script_map = {
                        "Gujarati": "guj",
                        "Bengali": "ben",
                        "Devanagari": "hin",
                        "Tamil": "tam",
                        "Telugu": "tel",
                        "Arabic": "ara",
                    }
                    for script_name, code in script_map.items():
                        if f"Script: {script_name}" in osd:
                            doc.close()
                            return code
                except Exception:
                    pass

                try:
                    ocr_text += pytesseract.image_to_string(img, lang=tess_langs, config="--oem 3 --psm 3")
                except Exception:
                    pass
                if len(ocr_text.strip()) > 150:
                    break

            lang = _unicode_heuristic(ocr_text)
            if lang:
                doc.close()
                return lang

            text = ocr_text  # use OCR output for langdetect below

        doc.close()

        if not text.strip() or len(text.strip()) < 15:
            return "unknown"

        # ── Step 3: langdetect for Latin-script languages ────────────────────
        if sum(1 for c in text if ord(c) < 128) > len(text) * 0.80:
            # Mostly ASCII — langdetect can handle Latin languages
            try:
                detected = detect(text)
                lang_map = {
                    "en": "eng", "bn": "ben", "hi": "hin", "gu": "guj",
                    "ta": "tam", "te": "tel", "mr": "mar", "ur": "urd",
                    "es": "spa", "fr": "fra", "de": "deu", "ar": "ara",
                    "zh-cn": "zho", "ja": "jpn", "ko": "kor", "ru": "rus",
                    "pt": "por", "it": "ita", "nl": "nld", "tr": "tur",
                    "vi": "vie", "th": "tha", "pl": "pol", "uk": "ukr",
                }
                return lang_map.get(detected, "unknown")
            except Exception:
                return "unknown"

        return "unknown"

    except Exception:
        return "unknown"

@router.get("/languages")
def get_languages(current_user: models.User = Depends(get_current_user)):
    return {"languages": SUPPORTED_LANGUAGES}

@router.post("/")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source_language: str = Form("auto"),
    target_language: str = Form("ben"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
    
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large.")
    
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, stored_name)
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    detected_source = source_language
    if source_language == "auto":
        detected_source = detect_pdf_language(file_path)
    
    if detected_source not in SUPPORTED_LANGUAGES and detected_source != "unknown":
        detected_source = "unknown"
        
    doc = models.Document(
        user_id=current_user.id,
        original_filename=file.filename,
        stored_filename=stored_name,
        status="pending",
        source_language=detected_source,
        target_language=target_language,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    task = process_document.delay(doc.id)
    doc.task_id = task.id
    db.commit()
    
    return {
        "id": doc.id,
        "status": "pending",
        "filename": file.filename,
        "detected_source_language": detected_source,
        "target_language": target_language,
    }