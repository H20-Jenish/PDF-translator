FROM python:3.11-slim

# System deps: Tesseract with multiple languages, poppler, font downloader
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-ben \
    tesseract-ocr-hin \
    tesseract-ocr-guj \
    tesseract-ocr-tam \
    tesseract-ocr-tel \
    tesseract-ocr-mar \
    tesseract-ocr-ara \
    tesseract-ocr-spa \
    tesseract-ocr-fra \
    tesseract-ocr-deu \
    libtesseract-dev \
    libleptonica-dev \
    poppler-utils \
    wget \
    ca-certificates \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Download Noto fonts for multiple languages
RUN mkdir -p /usr/share/fonts/truetype/noto && \
    wget -q https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf -O /usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf || true && \
    wget -q https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf -O /usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf || true && \
    wget -q https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansGujarati/NotoSansGujarati-Regular.ttf -O /usr/share/fonts/truetype/noto/NotoSansGujarati-Regular.ttf || true && \
    wget -q https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf -O /usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf || true && \
    wget -q https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Regular.ttf -O /usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf || true

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]