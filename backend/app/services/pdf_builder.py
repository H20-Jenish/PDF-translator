import fitz
import os
from typing import List, Dict, Any

FONT_MAP = {
    "ben": ("NotoSansBengali",    "NotoSansBengali-Regular.ttf"),
    "hin": ("NotoSansDevanagari", "NotoSansDevanagari-Regular.ttf"),
    "guj": ("NotoSansGujarati",   "NotoSansGujarati-Regular.ttf"),
    "tam": ("NotoSansTamil",      "NotoSansTamil-Regular.ttf"),
    "tel": ("NotoSansTelugu",     "NotoSansTelugu-Regular.ttf"),
    "mar": ("NotoSansDevanagari", "NotoSansDevanagari-Regular.ttf"),
    "urd": ("NotoNaskhArabic",    "NotoNaskhArabic-Regular.ttf"),
    "ara": ("NotoNaskhArabic",    "NotoNaskhArabic-Regular.ttf"),
    "zho": ("NotoSansCJK",        "NotoSansCJKsc-Regular.otf"),
    "jpn": ("NotoSansCJK",        "NotoSansCJKjp-Regular.otf"),
    "kor": ("NotoSansCJK",        "NotoSansCJKkr-Regular.otf"),
    "tha": ("NotoSansThai",       "NotoSansThai-Regular.ttf"),
}

DEFAULT_FONT = ("NotoSansBengali", "NotoSansBengali-Regular.ttf")


class PDFBuilder:
    """
    Builds the translated PDF using a rasterise-first strategy:

      1. Each original page (digital or scanned) is rendered to a raster image
         at 200 DPI and embedded as a full-page background in a new PDF.
      2. White rectangles are drawn over every text block that will be replaced
         (pixel-level erasure so both vector text and image pixels are covered).
      3. The target-language font is registered on the page (AFTER the redaction
         step — apply_redactions() wipes page-level font resources).
      4. Translated text is inserted into each cleared bbox with auto-scaling.

    This single unified path removes all scanned-vs-digital branching and
    guarantees that translated text is always renderable regardless of the
    original PDF encoding.
    """

    def __init__(self, original_pdf_path: str, output_path: str,
                 target_language: str = "ben"):
        self.original_pdf_path = original_pdf_path
        self.output_path = output_path

        font_info = FONT_MAP.get(target_language, DEFAULT_FONT)
        self.font_name = font_info[0]
        self.font_file = font_info[1]
        self.font_path = self._get_font_path()

        # Load font bytes once — re-used on every page after apply_redactions()
        # wipes the page-level font resources.
        self.font_buffer: bytes = None
        if self.font_path:
            try:
                with open(self.font_path, "rb") as fh:
                    self.font_buffer = fh.read()
            except Exception:
                pass

        # Output document is built from scratch (rasterised backgrounds)
        self._out_doc = fitz.open()

    def _get_font_path(self) -> str:
        search = [
            f"/usr/share/fonts/truetype/noto/{self.font_file}",
            f"/usr/share/fonts/truetype/{self.font_file}",
            f"/usr/share/fonts/opentype/noto/{self.font_file}",
        ]
        for fp in search:
            if os.path.exists(fp):
                return fp
        return None

    def _register_font_on_page(self, page) -> None:
        """
        Register the target-language font on *page*.

        Must be called **after** ``page.apply_redactions()`` because PyMuPDF
        rebuilds the page content stream during redaction and discards all
        previously registered font resources.
        """
        if self.font_buffer:
            try:
                page.insert_font(fontname=self.font_name,
                                 fontbuffer=self.font_buffer)
                return
            except Exception:
                pass
        if self.font_path:
            try:
                page.insert_font(fontname=self.font_name,
                                 fontfile=self.font_path)
            except Exception:
                pass

    def _insert_text_autofit(self, page, bbox: fitz.Rect, text: str,
                              font_size: float, color: tuple) -> None:
        """
        Insert *text* inside *bbox*.  If it overflows, reduce font size
        progressively (down to 6 pt) until it fits.
        """
        for scale in [1.0, 0.90, 0.80, 0.70, 0.60, 0.50]:
            fs = max(6.0, font_size * scale)
            try:
                kwargs = dict(
                    fontsize=fs,
                    color=color,
                    align=fitz.TEXT_ALIGN_LEFT,
                )
                if self.font_buffer or self.font_path:
                    kwargs["fontname"] = self.font_name

                result = page.insert_textbox(bbox, text, **kwargs)
                if result >= 0:
                    return  # text fit — done
            except Exception:
                return  # unrecoverable error; skip block

    def apply_translations(self, pages_data: List[Dict[str, Any]]) -> None:
        """
        Build the output PDF page-by-page.

        For each page:
          • Rasterise the original page at 200 DPI → background image.
          • Create a new blank page of the same dimensions.
          • Embed the rasterised image as a full-page background.
          • Redact (white-fill) every block marked ``should_replace``.
          • Re-register font (redaction wipes font resources).
          • Insert translated text into each cleared bbox.
        """
        orig_doc = fitz.open(self.original_pdf_path)

        try:
            for page_data in pages_data:
                page_num = page_data["page_num"] - 1
                if page_num >= len(orig_doc):
                    continue

                orig_page = orig_doc.load_page(page_num)
                w = orig_page.rect.width
                h = orig_page.rect.height

                # ── Step 1: Rasterise the original page ───────────────────────
                # 200 DPI balances output quality against file size.
                # fitz.Matrix(200/72, 200/72) scales from 72-pt PDF space to pixels.
                mat = fitz.Matrix(200 / 72, 200 / 72)
                pix = orig_page.get_pixmap(matrix=mat, alpha=False)
                img_bytes = pix.tobytes("png")

                # ── Step 2: Create new output page ────────────────────────────
                new_page = self._out_doc.new_page(width=w, height=h)

                # ── Step 3: Embed rasterised image as full-page background ────
                new_page.insert_image(
                    new_page.rect,
                    stream=img_bytes,
                    keep_proportion=False,
                )

                # ── Step 4: Identify blocks that need replacing ───────────────
                blocks = page_data.get("text_blocks", [])
                replace_blocks = [b for b in blocks if b.get("should_replace")]
                if not replace_blocks:
                    continue

                # ── Step 5: Add white-fill redactions over each text area ─────
                # Using white fill on an image-backed page ensures the original
                # text pixels are fully covered (not merely hidden by a layer).
                for block in replace_blocks:
                    new_page.add_redact_annot(
                        fitz.Rect(block["bbox"]),
                        fill=(1, 1, 1),
                    )

                # images=2 → also erase pixel data inside the redacted bbox
                # in any embedded raster image (covers the background image).
                new_page.apply_redactions(images=2)

                # ── Step 6: Re-register font (MUST be after apply_redactions) ─
                self._register_font_on_page(new_page)

                # ── Step 7: Insert translated text ────────────────────────────
                for block in replace_blocks:
                    text = block.get("translated_text", "").strip()
                    if not text:
                        continue
                    self._insert_text_autofit(
                        new_page,
                        fitz.Rect(block["bbox"]),
                        text,
                        block.get("font_size", 11.0),
                        block.get("color", (0, 0, 0)),
                    )
        finally:
            orig_doc.close()

    def build(self) -> None:
        """Save and close the output PDF."""
        self._out_doc.save(self.output_path, garbage=4, deflate=True)
        self._out_doc.close()
