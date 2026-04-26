from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.lifespan import build_lifespan
from src.routes import docs, health, ingest

app = FastAPI(
    title="TieTide AI Service",
    description="AI documentation generation for TieTide workflows",
    version="0.1.0",
    lifespan=build_lifespan(
        llm_client_factory=docs.get_ollama_client,
        doc_service_factory=docs.get_documentation_service,
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3030"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(docs.router)
app.include_router(ingest.router)
