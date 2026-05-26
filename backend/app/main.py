from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, upload, documents, settings as user_settings, health, models as model_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="PDF Bengali Translator", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(documents.router)
app.include_router(user_settings.router)
app.include_router(health.router)
app.include_router(model_router.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}