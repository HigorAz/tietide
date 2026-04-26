"""POST /ingest — load node taxonomy and example workflows into ChromaDB."""

from __future__ import annotations

import logging
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException

from src.config import settings
from src.services.embeddings import SentenceTransformerEmbedder
from src.services.ingestion import IngestionService
from src.services.vector_store import ChromaVectorStore

logger = logging.getLogger(__name__)

router = APIRouter()


@lru_cache(maxsize=1)
def get_ingestion_service() -> IngestionService:
    embedder = SentenceTransformerEmbedder(model_name=settings.embedding_model)
    store = ChromaVectorStore(
        host=settings.chroma_host,
        port=settings.chroma_port,
        collection_name=settings.chroma_collection,
    )
    return IngestionService(embedder=embedder, store=store)


@router.post("/ingest")
async def ingest_documents(
    service: IngestionService = Depends(get_ingestion_service),
):
    try:
        report = service.run()
    except FileNotFoundError as exc:
        logger.error("Ingestion data missing: %s", exc)
        raise HTTPException(status_code=500, detail="Ingestion data not available") from exc
    except Exception as exc:
        logger.exception("Ingestion failed")
        raise HTTPException(status_code=503, detail="Ingestion service unavailable") from exc

    return report.as_dict()
