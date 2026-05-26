import fitz
import pytesseract
from pytesseract import Output
from PIL import Image, ImageOps
import io
from typing import Dict, Any, List

# ── Sentence terminators for Indian and universal scripts ─────────────────────
# The system splits OCR output into paragraph-level chunks at these characters
# so every translation unit is a complete semantic sentence.
#
# Supported terminators:
#   ।  U+0964  Devanagari danda        — Hindi, Gujarati, Marathi, Bengali, Punjabi, Sanskrit
#   ॥  U+0965  Devanagari double danda — Sanskrit shloka end, also used in Gujarati/Marathi
#   ।  (same U+0964, used in Bengali too — Unicode alias)
#   ۔  U+06D4  Arabic/Urdu full stop   — Urdu
#   ؟  U+061F  Arabic question mark    — Arabic, Urdu
#   ।  U+0964  (Gujarati, Punjabi share this with Devanagari)
#   ።  U+1362  Ethiopic full stop      — Amharic
#   ។  U+17D4  Khmer full stop         — Khmer
#   。 U+3002  CJK ideographic stop    — Chinese, Japanese, Korean
#   .  U+002E  Latin period            — English and romanised text
#   ?  U+003F  Question mark
#   !  U+0021  Exclamation mark
#   |  U+007C  Pipe/vertical bar       — sometimes used as danda substitute

SENTENCE_TERMINATORS = frozenset([
    '\u0964',   # । Devanagari danda (shared by Gujarati, Bengali, Hindi, Marathi…)
    '\u0965',   # ॥ Devanagari double danda
    '\u06D4',   # ۔ Urdu/Arabic full stop
    '\u061F',   # ؟ Arabic question mark
    '\u1362',   # ። Ethiopic full stop
    '\u17D4',   # ។ Khmer full stop
    '\u3002',   # 。 CJK ideographic full stop
    '.',
    '?',
    '!',
    '|',
])


def _ends_with_terminator(word: str) -> bool:
    """Return True if the word ends with any sentence-terminating character."""
    return bool(word) and word[-1] in SENTENCE_TERMINATORS


class PDFProcessor:
    """
    Unified PDF content extractor.

    Always rasterises every page (300 DPI) and runs Tesseract OCR regardless
    of whether the source PDF is scanned or digital. This guarantees a single,
    predictable code path and avoids PyMuPDF text-extraction artefacts on
    complex Indic layouts.

    Words are grouped into sentence-level blocks using a comprehensive set of
    Indian and universal sentence terminators so that each block passed to the
    translation service is a complete semantic unit.
    """

    def __init__(self, file_path: str, ocr_language: str = "eng"):
        self.file_path = file_path
        self.doc = fitz.open(file_path)
        self.ocr_language = ocr_language

    def _preprocess_image(self, img: Image.Image) -> Image.Image:
        """Convert to grayscale. Tesseract performs best on clean grayscale input."""
        return ImageOps.grayscale(img)

    def _is_valid_text(self, text: str) -> bool:
        text = text.strip()
        if not text:
            return False
        if len(text) <= 1 and not text.isalnum():
            return False
        return True

    def _ocr_page_words(self, page) -> List[dict]:
        """
        Rasterise *page* at 300 DPI, run Tesseract, and return a list of
        word-level dicts with coordinates already converted to PDF points.
        """
        # 300 DPI gives accurate character shapes without being too slow
        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        processed = self._preprocess_image(img)

        # Scale factors: convert Tesseract pixel coords → PDF-point coords
        scale_x = page.rect.width / img.width
        scale_y = page.rect.height / img.height

        custom_config = r'--oem 3 --psm 3'
        data = pytesseract.image_to_data(
            processed,
            lang=self.ocr_language,
            config=custom_config,
            output_type=Output.DICT,
        )

        words = []
        for i in range(len(data['text'])):
            word_text = data['text'][i].strip()
            conf = int(data['conf'][i])
            if conf > 15 and word_text:
                words.append({
                    'text':      word_text,
                    'block_num': data['block_num'][i],
                    'par_num':   data['par_num'][i],
                    'line_num':  data['line_num'][i],
                    'x0':        data['left'][i] * scale_x,
                    'y0':        data['top'][i]  * scale_y,
                    'x1':        (data['left'][i] + data['width'][i])  * scale_x,
                    'y1':        (data['top'][i]  + data['height'][i]) * scale_y,
                    # word height in PDF points — used to estimate font size
                    'h_pts':     data['height'][i] * scale_y,
                })
        return words

    def _group_into_sentences(self, words: List[dict], page_rect) -> List[dict]:
        """
        Group words into paragraph/sentence-level blocks.

        Strategy:
          1. Tesseract's (block_num, par_num) boundaries are respected: a new
             paragraph always starts when Tesseract changes the paragraph id.
          2. Within a Tesseract paragraph, words are further split whenever a
             word ends with one of the SENTENCE_TERMINATORS (।  ॥  ۔  .  ?  !
             |  etc.).  This keeps each translation unit as a single complete
             sentence, which gives the AI the right context and allows tighter
             bounding-box redaction.
        """
        if not words:
            return []

        blocks: List[dict] = []

        # Accumulator for the current sentence being built
        buf_words: List[dict] = []
        buf_x0 = buf_y0 = float('inf')
        buf_x1 = buf_y1 = 0.0

        def flush():
            nonlocal buf_words, buf_x0, buf_y0, buf_x1, buf_y1
            if not buf_words:
                return
            text = ' '.join(w['text'] for w in buf_words)
            if not self._is_valid_text(text):
                buf_words = []
                buf_x0 = buf_y0 = float('inf')
                buf_x1 = buf_y1 = 0.0
                return

            # Font-size estimate: use median word height × 0.75
            # (word bounding box is ~1.3× cap-height, × 0.75 ≈ cap-height ≈ font size)
            heights = [w['h_pts'] for w in buf_words if w['h_pts'] > 2]
            if heights:
                heights.sort()
                median_h = heights[len(heights) // 2]
                font_size = max(8.0, min(36.0, median_h * 0.75))
            else:
                font_size = 11.0

            pad = 3
            blocks.append({
                'text':      text,
                'bbox':      [
                    max(0,                buf_x0 - pad),
                    max(0,                buf_y0 - pad),
                    min(page_rect.width,  buf_x1 + pad),
                    min(page_rect.height, buf_y1 + pad),
                ],
                'type':      'ocr',
                'font_size': font_size,
                'bold':      False,
                'italic':    False,
                'color':     (0, 0, 0),
            })
            buf_words = []
            buf_x0 = buf_y0 = float('inf')
            buf_x1 = buf_y1 = 0.0

        current_par: tuple = None

        for w in words:
            par_id = (w['block_num'], w['par_num'])

            # Tesseract paragraph boundary → always flush
            if current_par is not None and par_id != current_par:
                flush()

            current_par = par_id

            buf_words.append(w)
            buf_x0 = min(buf_x0, w['x0'])
            buf_y0 = min(buf_y0, w['y0'])
            buf_x1 = max(buf_x1, w['x1'])
            buf_y1 = max(buf_y1, w['y1'])

            # Sentence terminator → flush within the same Tesseract paragraph
            if _ends_with_terminator(w['text']):
                flush()

        flush()  # trailing words with no terminator
        return blocks

    def extract_content(self) -> Dict[str, Any]:
        """
        Extract all pages as sentence-level OCR blocks.

        Every page is rasterised regardless of whether the source PDF is
        scanned or contains embedded vector text.
        """
        pages = []
        for page_num in range(len(self.doc)):
            page = self.doc.load_page(page_num)
            words = self._ocr_page_words(page)
            text_blocks = self._group_into_sentences(words, page.rect)
            pages.append({
                'page_num':   page_num + 1,
                'width':      page.rect.width,
                'height':     page.rect.height,
                'text_blocks': text_blocks,
            })

        return {
            'pages':      pages,
            'is_scanned': True,   # always treated as raster from this point on
            'page_count': len(self.doc),
        }

    def close(self):
        self.doc.close()