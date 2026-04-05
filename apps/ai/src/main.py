from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routes import health, docs, ingest

app = FastAPI(
    title="TieTide AI Service",
    description="AI documentation generation for TieTide workflows",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(docs.router)
app.include_router(ingest.router)
