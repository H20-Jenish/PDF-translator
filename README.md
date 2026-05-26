# PDF Bengali Translator

PDF Bengali Translator is a full-stack web application for translating PDF documents into Bengali. It combines a React/Tailwind frontend, a FastAPI backend, Celery background processing, PostgreSQL metadata storage, Redis task queueing, and Ollama local LLM integration for translation.

## Key Features

- User registration, login, and JWT-based authentication
- PDF upload and asynchronous translation pipeline
- OCR-enabled text extraction using PyMuPDF and Tesseract
- Automatic source-language detection when requested
- Customizable target language selection (default: Bengali)
- Downloadable translated PDF documents
- User settings for AI server URL, model configuration, and API key
- Health checks for backend, database, Redis, Celery, and Ollama
- Docker Compose-ready stack with separate backend, frontend, database, Redis, Celery worker, and Ollama services

## Architecture Overview

The application is designed as a modular containerized system:

- `frontend/` - React application served through Nginx
- `backend/` - FastAPI application with authentication, upload, document, settings, and health routes
- `db` - PostgreSQL for user and document metadata
- `redis` - Redis broker and backend for Celery task queueing
- `celery_worker` - Celery worker that processes uploaded PDFs asynchronously
- `ollama` - Local AI server for model inference

The translation pipeline flow is:

1. User uploads PDF via frontend
2. Backend stores the PDF and creates a document record
3. Celery worker extracts text, OCRs if needed, and calls Ollama
4. Translated text is written back into a new PDF via ReportLab
5. User can download the translated file once complete

## Repository Structure

```
backend/
  Dockerfile
  requirements.txt
  app/
    main.py
    auth.py
    config.py
    database.py
    dependencies.py
    models.py
    schemas.py
    tasks.py
    routers/
      auth.py
      upload.py
      documents.py
      settings.py
      health.py
      models.py
frontend/
  Dockerfile
  nginx.conf
  package.json
  src/
    App.js
    components/
    context/
```

## Prerequisites

Recommended:

- Docker Engine
- Docker Compose
- Optional: Node.js and npm/yarn if running frontend locally

> Docker Compose is the easiest way to run this project because the backend depends on system packages such as Tesseract, poppler, and fonts.

## Environment Variables

The backend reads settings from environment variables and `.env` file via `pydantic-settings`. These variables are defined in `docker-compose.yml` and can be overridden locally.

- `DB_USER` - PostgreSQL username (default: `pdfuser`)
- `DB_PASSWORD` - PostgreSQL password (default: `pdfpass`)
- `DB_NAME` - PostgreSQL database name (default: `pdftranslator`)
- `BACKEND_PORT` - Mapped host port for backend (default: `8000`)
- `FRONTEND_PORT` - Mapped host port for frontend (default: `3000`)
- `SECRET_KEY` - JWT secret key for backend
- `AI_SERVER_URL` - Ollama server URL (default: `http://ollama:11434`)
- `AI_MODEL` - Ollama model name (default: `translategemma:12b`)
- `OLLAMA_API_KEY` - Optional Ollama API key if required

Backend-specific .env defaults are also defined in `backend/app/config.py`:

- `UPLOAD_DIR=./uploads`
- `OUTPUT_DIR=./outputs`

## Running the Application with Docker Compose

From the project root:

```bash
docker compose up --build -d
```

This command builds and starts all containers:

- `db` - PostgreSQL
- `redis` - Redis
- `ollama` - Ollama AI server
- `backend` - FastAPI application
- `celery_worker` - Celery worker process
- `frontend` - React + Nginx frontend

To view logs:

```bash
docker compose logs -f backend
docker compose logs -f celery_worker
docker compose logs -f frontend
```

To stop and remove containers:

```bash
docker compose down
```

## Service Endpoints

### Frontend

- `http://localhost:3000/` - React application UI

### Backend API

- `http://localhost:8000/api/auth/register` - Register a new user
- `http://localhost:8000/api/auth/login` - Login and receive JWT token
- `http://localhost:8000/api/auth/change-password` - Change user password
- `http://localhost:8000/api/upload/` - Upload PDF and start translation
- `http://localhost:8000/api/upload/languages` - Fetch supported languages
- `http://localhost:8000/api/documents/` - List user documents
- `http://localhost:8000/api/documents/{id}/download?token=JWT` - Download translated PDF
- `http://localhost:8000/api/documents/{id}` - Delete a document
- `http://localhost:8000/api/settings/` - Get or update per-user AI settings
- `http://localhost:8000/api/models/ollama` - List available Ollama models
- `http://localhost:8000/api/health/services` - Health checks for database, Redis, Ollama, and Celery
- `http://localhost:8000/api/health` - Basic API health status

## Authentication and Security

- Authentication is JWT-based.
- Login returns an access token:

```json
{
  "access_token": "...",
  "token_type": "bearer"
}
```

- Protected endpoints use the `Authorization: Bearer <token>` header.
- The frontend stores token state in `localStorage` via `AuthContext`.

## Upload and Translation Flow

1. Upload a PDF through the frontend using the `file` field.
2. Select `source_language` and `target_language`.
3. If `source_language` is `auto`, the backend attempts language detection using text extraction and Tesseract OCR.
4. The backend stores the PDF in `uploads/` and creates a new `Document` database record.
5. Celery worker processes the document asynchronously.
6. The worker extracts text and OCR content from the PDF, sends text blocks to Ollama for translation, and rebuilds a translated PDF using ReportLab.
7. When completed, the translated PDF is saved in `outputs/` and the document status is updated.
8. The user can download the translated PDF from the document history view.

## Supported Languages

The backend exposes supported languages at `/api/upload/languages` and includes:

- `auto`, `eng`, `ben`, `hin`, `guj`, `tam`, `tel`, `mar`, `urd`, `spa`, `fra`, `deu`, `ara`, `zho`, `jpn`, `kor`, `rus`, `por`, `ita`, `nld`, `tur`, `vie`, `tha`, `pol`, `ukr`

## AI Integration

This app uses Ollama as the AI inference server.

- Default Ollama URL: `http://ollama:11434`
- Default model: `translategemma:12b`
- The backend calls Ollama via `httpx` to retrieve available models and to translate text blocks.

The user can override these values in user settings or via environment variables.

## Backend Processing Components

- `backend/app/main.py` - FastAPI application entrypoint
- `backend/app/routers/` - API route modules
- `backend/app/tasks.py` - Celery task for document processing
- `backend/app/services/` - PDF extraction, translation, and PDF rebuild logic
- `backend/app/models.py` - SQLAlchemy ORM models
- `backend/app/schemas.py` - Pydantic request/response schemas
- `backend/app/config.py` - Configuration settings driven by environment variables

## Dockerfile Notes

### Backend Dockerfile

- Uses `python:3.11-slim`
- Installs Tesseract OCR and language packs
- Installs `poppler-utils` for PDF rendering
- Downloads Noto fonts for multilingual output
- Installs Python dependencies from `requirements.txt`

### Frontend Dockerfile

- Builds the React app using Node 18
- Serves the built static site from Nginx

## Development Notes

### Running Backend Locally (Optional)

If you prefer not to use Docker for backend development, you can run the backend directly after installing dependencies.

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> Note: Local backend execution still requires Tesseract, poppler, and the proper language packs installed on your machine.

### Running Frontend Locally (Optional)

```bash
cd frontend
npm install
npm start
```

This starts the React development server on port `3000`.

## Troubleshooting

- If uploads fail with `413`, the PDF exceeds the 100MB limit.
- If translation fails, check `docker compose logs celery_worker` and `docker compose logs backend`.
- If Ollama is unavailable, verify `http://localhost:11434` or the configured `AI_SERVER_URL`.
- If user authentication fails, make sure the JWT is sent as `Authorization: Bearer <token>`.

## Volumes and Persistence

Docker Compose persists data through named volumes:

- `postgres_data` - PostgreSQL database files
- `uploads` - uploaded PDF files
- `outputs` - translated PDF output files
- `ollama_data` - Ollama persisted model/state data

## Useful Commands

```bash
docker compose up --build -d
docker compose logs -f backend
docker compose logs -f celery_worker
docker compose down
```

## Contact and Contribution

This repository is designed for document translation workflows and local AI integration. Contributions should focus on improving OCR reliability, expanding language support, and making the translation pipeline more robust.

---

*README generated for the PDF Bengali Translator project.*
