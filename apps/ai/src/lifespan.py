"""Lifespan bootstrap: warm up the model and prime the demo doc cache."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Protocol

from fastapi import FastAPI

from src.services.documentation import (
    DocumentationGenerationError,
    GeneratedDocumentation,
)
from src.services.warmup import warm_up_model
from src.state import ServiceState, get_service_state

logger = logging.getLogger(__name__)

DEMO_WORKFLOWS_DIR = Path(__file__).parent / "data" / "examples"


class _LlmClient(Protocol):
    async def generate(
        self,
        prompt: str,
        *,
        temperature: float,
        max_tokens: int,
    ) -> str: ...


class _DocService(Protocol):
    async def generate(
        self, workflow: dict[str, Any]
    ) -> GeneratedDocumentation: ...


def load_demo_workflows(directory: Path = DEMO_WORKFLOWS_DIR) -> list[dict[str, Any]]:
    """Read demo workflow JSON files into the shape expected by the docs service."""
    if not directory.exists():
        return []

    workflows: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json")):
        try:
            with path.open(encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Skipping unreadable demo workflow %s: %s", path.name, exc)
            continue

        workflows.append(
            {
                "workflow_id": f"demo-{path.stem}",
                "workflow_name": str(data.get("name") or path.stem),
                "definition": data.get("definition", {}),
            }
        )
    return workflows


async def bootstrap(
    state: ServiceState,
    *,
    llm_client: _LlmClient,
    demo_workflows: list[dict[str, Any]],
    doc_service: _DocService,
) -> None:
    """Warm up the model and pre-generate documentation for demo workflows."""
    result = await warm_up_model(llm_client)
    state.warmed_up = result.success
    state.warmup_error = result.error

    if not result.success:
        return

    for workflow in demo_workflows:
        try:
            generated = await doc_service.generate(workflow)
        except DocumentationGenerationError as exc:
            logger.warning(
                "Skipping demo cache entry for %s: %s",
                workflow.get("workflow_id"),
                exc,
            )
            continue
        except Exception:
            logger.exception(
                "Unexpected error priming demo cache for %s",
                workflow.get("workflow_id"),
            )
            continue
        state.demo_cache.register(workflow, generated)


def build_lifespan(
    *,
    llm_client_factory,
    doc_service_factory,
    demo_workflows_loader=load_demo_workflows,
):
    """Build the FastAPI lifespan context manager wired to the given providers."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        state = get_service_state()
        try:
            await bootstrap(
                state,
                llm_client=llm_client_factory(),
                demo_workflows=demo_workflows_loader(),
                doc_service=doc_service_factory(),
            )
        except Exception:
            logger.exception("Bootstrap failed during startup")
        yield

    return lifespan
