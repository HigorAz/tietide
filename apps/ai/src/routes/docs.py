"""POST /generate-docs — generate workflow documentation via RAG + Ollama."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.config import settings
from src.services.documentation import (
    DocumentationGenerationError,
    DocumentationService,
)
from src.services.embeddings import SentenceTransformerEmbedder
from src.services.ollama_client import (
    OllamaClient,
    OllamaTimeoutError,
    OllamaUnavailableError,
)
from src.services.prompt import PromptBuilder
from src.services.retriever import Retriever
from src.services.vector_store import ChromaVectorStore

logger = logging.getLogger(__name__)

router = APIRouter()


class GenerateDocsRequest(BaseModel):
    workflow_id: str = Field(..., min_length=1)
    workflow_name: str = Field(..., min_length=1)
    definition: dict[str, Any]


class DocumentationSectionsResponse(BaseModel):
    objective: str
    triggers: str
    actions: str
    data_flow: str
    decisions: str


class GenerateDocsResponse(BaseModel):
    workflow_id: str
    workflow_name: str
    sections: DocumentationSectionsResponse
    documentation: str
    model: str


@lru_cache(maxsize=1)
def get_documentation_service() -> DocumentationService:
    embedder = SentenceTransformerEmbedder(model_name=settings.embedding_model)
    store = ChromaVectorStore(
        host=settings.chroma_host,
        port=settings.chroma_port,
        collection_name=settings.chroma_collection,
    )
    retriever = Retriever(embedder=embedder, store=store, top_k=4)
    llm = OllamaClient(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
        timeout=120.0,
    )
    return DocumentationService(
        retriever=retriever,
        prompt_builder=PromptBuilder(),
        llm_client=llm,
        temperature=0.3,
        max_tokens=1024,
    )


@router.post("/generate-docs", response_model=GenerateDocsResponse)
async def generate_docs(
    request: GenerateDocsRequest,
    service: DocumentationService = Depends(get_documentation_service),
) -> GenerateDocsResponse:
    try:
        result = await service.generate(request.model_dump())
    except OllamaTimeoutError:
        logger.warning("Documentation generation timed out for workflow %s", request.workflow_id)
        raise HTTPException(
            status_code=503,
            detail="AI service temporarily unavailable (timeout)",
        )
    except OllamaUnavailableError:
        logger.warning("Ollama unavailable for workflow %s", request.workflow_id)
        raise HTTPException(
            status_code=503,
            detail="AI service temporarily unavailable",
        )
    except DocumentationGenerationError as exc:
        logger.warning("Failed to parse model output: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI service returned an unparseable response",
        )

    return GenerateDocsResponse(
        workflow_id=result.workflow_id,
        workflow_name=result.workflow_name,
        sections=DocumentationSectionsResponse(**result.sections.as_dict()),
        documentation=result.documentation,
        model=settings.ollama_model,
    )
