"""POST /generate-docs — generate workflow documentation via RAG + Ollama."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.auth import require_internal_token
from src.config import settings
from src.services.demo_cache import DemoDocumentationCache
from src.services.documentation import (
    DocumentationGenerationError,
    DocumentationService,
    GeneratedDocumentation,
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
from src.state import get_service_state

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_internal_token)])


class GenerateDocsRequest(BaseModel):
    workflow_id: str = Field(..., min_length=1)
    workflow_name: str = Field(..., min_length=1)
    definition: dict[str, Any]
    # Deterministic ground-truth facts computed by the API. Optional: when absent
    # the AI service computes its own (label-only) fallback from the definition.
    facts: dict[str, Any] | None = None


class DocumentationSectionsResponse(BaseModel):
    overview: str
    prerequisites: str
    trigger: str
    walkthrough: str
    data_flow: str
    decisions: str
    error_handling: str


class GenerateDocsResponse(BaseModel):
    workflow_id: str
    workflow_name: str
    sections: DocumentationSectionsResponse
    documentation: str
    model: str
    cached: bool = False


@lru_cache(maxsize=1)
def get_ollama_client() -> OllamaClient:
    return OllamaClient(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
        # Generous timeout: doc generation is serialized (one at a time), so a
        # queued second request must wait out the first plus its own (now richer,
        # longer) generation without tripping a false 503.
        timeout=300.0,
    )


@lru_cache(maxsize=1)
def get_documentation_service() -> DocumentationService:
    embedder = SentenceTransformerEmbedder(model_name=settings.embedding_model)
    store = ChromaVectorStore(
        host=settings.chroma_host,
        port=settings.chroma_port,
        collection_name=settings.chroma_collection,
    )
    retriever = Retriever(embedder=embedder, store=store, top_k=4)
    return DocumentationService(
        retriever=retriever,
        prompt_builder=PromptBuilder(),
        llm_client=get_ollama_client(),
        temperature=0.3,
        # Richer, node-by-node documentation (incl. the walkthrough section) needs
        # a larger generation budget than the original terse 5-section output.
        max_tokens=2048,
        structured_output=settings.ollama_structured_output,
    )


def get_demo_cache() -> DemoDocumentationCache:
    return get_service_state().demo_cache


def _to_response(
    result: GeneratedDocumentation, *, cached: bool
) -> GenerateDocsResponse:
    return GenerateDocsResponse(
        workflow_id=result.workflow_id,
        workflow_name=result.workflow_name,
        sections=DocumentationSectionsResponse(**result.sections.as_dict()),
        documentation=result.documentation,
        model=settings.ollama_model,
        cached=cached,
    )


@router.post("/generate-docs", response_model=GenerateDocsResponse)
async def generate_docs(
    request: GenerateDocsRequest,
    service: DocumentationService = Depends(get_documentation_service),
    cache: DemoDocumentationCache = Depends(get_demo_cache),
) -> GenerateDocsResponse:
    # Bound the untrusted definition before it reaches the RAG/LLM pipeline.
    definition_size = len(json.dumps(request.definition).encode("utf-8"))
    if definition_size > settings.max_definition_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"definition exceeds {settings.max_definition_bytes} bytes",
        )

    payload = request.model_dump()

    cached_doc = cache.get(payload)
    if cached_doc is not None:
        logger.info("Demo cache hit for workflow %s", request.workflow_id)
        return _to_response(cached_doc, cached=True)

    try:
        result = await service.generate(payload)
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

    return _to_response(result, cached=False)
