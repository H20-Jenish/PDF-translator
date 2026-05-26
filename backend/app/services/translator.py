import httpx
from app.config import settings

# English refusal / self-introduction phrases.
_REFUSAL_PATTERNS_EN = [
    "sorry, i ", "i'm sorry", "i cannot", "i can't", "i am unable",
    "as an ai", "as a language model", "as an assistant",
    "i don't understand", "i am a ", "i'm a ",
    "this text", "the text", "please provide",
    "i need more", "could you please",
]

# Bengali refusal / self-introduction phrases that the model sometimes outputs
# instead of a translation when it cannot understand the input.
# Checked as substrings (case-sensitive, Bengali script doesn't have case).
_REFUSAL_PATTERNS_BN = [
    "আমি দুঃখিত",           # I'm sorry
    "দুঃখিত, কিন্তু",       # Sorry, but
    "বুঝতে পারছি না",       # can't understand
    "বোধগম্য নয়",           # not comprehensible
    "অনুবাদ করতে পারছি না", # can't translate
    "অনুবাদ করা সম্ভব নয়",  # translation not possible
    "পেশাদার অনুবাদ ইঞ্জিন",# professional translation engine (self-intro)
    "টেক্সটটি প্রদান করুন",  # please provide the text
    "আমি এটি বুঝতে",        # I can't understand this
    "প্রদান করুন",           # please provide
]

def _looks_like_garbage(text: str) -> bool:
    """
    Return True if the text looks like OCR garbage that is not worth sending
    to the translation model.

    Heuristics applied:
    - No alphabetic characters at all.
    - Fewer than 3 words and shorter than 10 characters.
    - More than 60 % of alphabetic characters are plain ASCII in a text that
      also contains Indic/non-Latin script — typical sign of mixed OCR noise
      (e.g. "RA5જ2 ABC ૧" where Tesseract misread Gujarati glyphs as Latin).
    - More than 50 % of all characters are digits or punctuation — usually
      page numbers, table borders, or misread decorative rules.
    """
    words = text.split()
    if not words:
        return True

    alpha_chars = [c for c in text if c.isalpha()]
    if not alpha_chars:
        return True

    # Too short to be a real translatable segment
    if len(words) < 3 and len(text) < 10:
        return True

    # Digit/punctuation-heavy → likely a page number or table noise
    non_alpha = sum(1 for c in text if not c.isalpha() and not c.isspace())
    if non_alpha / max(len(text), 1) > 0.50:
        return True

    # Mixed ASCII + Indic → OCR confusion; don't send to the model
    has_indic = any(ord(c) > 0x0900 for c in alpha_chars)
    ascii_ratio = sum(1 for c in alpha_chars if ord(c) < 128) / len(alpha_chars)
    if has_indic and ascii_ratio > 0.60:
        return True

    return False


class TranslatorService:
    def __init__(self, server_url: str = None, model: str = None, api_key: str = None):
        self.server_url = (server_url or settings.AI_SERVER_URL).rstrip("/")
        self.model = model or settings.AI_MODEL
        self.api_key = api_key or settings.OLLAMA_API_KEY

    def translate_text(self, text: str, target_lang: str = "Bengali") -> str:
        text = text.strip()
        if not text or len(text) <= 1 or not any(c.isalpha() for c in text):
            return text

        # Skip obviously garbled OCR output — no point sending noise to the LLM
        if _looks_like_garbage(text):
            return text

        try:
            response = httpx.post(
                f"{self.server_url}/v1/chat/completions",
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                f"You are a professional translation engine. "
                                f"Translate the following text into {target_lang}. "
                                f"Output ONLY the translated text — no explanations, no commentary, "
                                f"no self-introduction. "
                                f"Preserve the original paragraph structure and punctuation style. "
                                f"If the input is unreadable gibberish, output an empty string."
                            ),
                        },
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0.0,
                    "max_tokens": 4096,
                },
                headers={"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
                timeout=180.0,
            )
            response.raise_for_status()
            result = response.json()["choices"][0]["message"]["content"].strip()

            # Filter: English refusal / self-introduction
            result_lower = result.lower()
            if any(p in result_lower for p in _REFUSAL_PATTERNS_EN):
                return ""

            # Filter: Bengali refusal / self-introduction
            # These appear when the model cannot parse noisy OCR input and
            # responds in the target language instead of translating.
            if any(p in result for p in _REFUSAL_PATTERNS_BN):
                return ""

            # Filter: result is suspiciously longer than input (hallucination).
            # Bengali text is typically 10–30 % longer than Gujarati for the
            # same content; 2.5× allows reasonable expansion while blocking
            # invented paragraphs, bullet lists, and fabricated data.
            if len(result) > len(text) * 2.5:
                return text

            # Trim surrounding quotation marks added by the model
            if len(result) >= 2 and result[0] in ('"', "'") and result[-1] in ('"', "'"):
                result = result[1:-1]

            return result.strip()

        except Exception as e:
            print(f"Translation error: {str(e)}")
            return text

    def translate_blocks(self, blocks: list, target_lang: str = "Bengali") -> list:
        is_bengali_target = target_lang.strip().lower() == "bengali"
        for block in blocks:
            original = (block.get("text") or "").strip()
            translated = self.translate_text(original, target_lang).strip()

            # If the model failed or returned unchanged text, keep original block untouched.
            should_replace = bool(translated) and translated != original

            # Extra guard for Bengali target: reject outputs that contain no Bengali script,
            # because these are typically failed / transliterated / hallucinated responses.
            if should_replace and is_bengali_target:
                ben_chars = sum(1 for c in translated if "\u0980" <= c <= "\u09FF")
                alpha_chars = sum(1 for c in translated if c.isalpha())
                if alpha_chars > 0 and ben_chars / alpha_chars < 0.10:
                    should_replace = False

            # Secondary Bengali refusal check at the block level — catches
            # refusals that slipped past the per-call filter (e.g. prefixed
            # with a partial valid sentence).
            if should_replace and is_bengali_target:
                if any(p in translated for p in _REFUSAL_PATTERNS_BN):
                    should_replace = False

            block["translated_text"] = translated if should_replace else original
            block["should_replace"] = should_replace
        return blocks