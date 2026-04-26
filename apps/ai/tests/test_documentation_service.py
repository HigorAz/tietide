"""Unit tests for the documentation generation orchestration service."""

from __future__ import annotations

import json

import pytest

from src.services.documentation import (
    DocumentationService,
    DocumentationGenerationError,
)
from src.services.ollama_client import OllamaTimeoutError, OllamaUnavailableError
from src.services.prompt import PromptBuilder
from src.services.retriever import Retriever
from tests.fakes import FakeEmbedder, FakeLlmClient, FakeVectorStore


WORKFLOW = {
    "workflow_id": "wf-1",
    "workflow_name": "Daily Sync",
    "definition": {
        "nodes": [
            {"id": "trigger", "type": "cron-trigger", "params": {"cron": "0 9 * * *"}},
            {"id": "fetch", "type": "http-request", "params": {"url": "https://x"}},
        ],
        "edges": [{"from": "trigger", "to": "fetch"}],
    },
}

SECTIONS = {
    "objective": "Sync partner orders to internal endpoint daily.",
    "triggers": "Cron trigger that fires every day at 09:00.",
    "actions": "HTTP request to fetch orders, then forward to ingest.",
    "data_flow": "Trigger → fetch → forward.",
    "decisions": "No conditional branches; failure aborts the run.",
}


def _seed(store: FakeVectorStore) -> None:
    store.add(
        ids=["node:cron-trigger", "node:http-request"],
        documents=[
            "Node: Cron Trigger — fires on a cron schedule.",
            "Node: HTTP Request — performs an HTTP call.",
        ],
        metadatas=[
            {"source": "node_taxonomy", "node_type": "cron-trigger"},
            {"source": "node_taxonomy", "node_type": "http-request"},
        ],
        embeddings=[[0.0] * 8, [0.0] * 8],
    )


def _build_service(
    llm_response: str | None = None,
    seed: bool = True,
    top_k: int = 3,
) -> tuple[DocumentationService, FakeLlmClient, FakeVectorStore]:
    embedder = FakeEmbedder()
    store = FakeVectorStore()
    if seed:
        _seed(store)
    retriever = Retriever(embedder=embedder, store=store, top_k=top_k)
    llm = FakeLlmClient(response=llm_response if llm_response is not None else json.dumps(SECTIONS))
    service = DocumentationService(
        retriever=retriever,
        prompt_builder=PromptBuilder(),
        llm_client=llm,
        temperature=0.3,
        max_tokens=1024,
    )
    return service, llm, store


class TestDocumentationService:
    class TestGenerate:
        async def test_returns_structured_documentation(self):
            service, _, _ = _build_service()

            result = await service.generate(WORKFLOW)

            assert result.sections.objective == SECTIONS["objective"]
            assert result.sections.triggers == SECTIONS["triggers"]
            assert result.sections.actions == SECTIONS["actions"]
            assert result.sections.data_flow == SECTIONS["data_flow"]
            assert result.sections.decisions == SECTIONS["decisions"]

        async def test_renders_markdown_documentation(self):
            service, _, _ = _build_service()

            result = await service.generate(WORKFLOW)

            assert "# Daily Sync" in result.documentation
            assert "## Objective" in result.documentation
            assert "## Triggers" in result.documentation
            assert "## Actions" in result.documentation
            assert "## Data Flow" in result.documentation
            assert "## Decisions" in result.documentation
            assert SECTIONS["objective"] in result.documentation

        async def test_calls_llm_with_temperature_and_max_tokens(self):
            service, llm, _ = _build_service()

            await service.generate(WORKFLOW)

            assert len(llm.calls) == 1
            call = llm.calls[0]
            assert call["temperature"] == 0.3
            assert call["max_tokens"] == 1024

        async def test_prompt_includes_rag_context(self):
            service, llm, _ = _build_service()

            await service.generate(WORKFLOW)

            prompt = llm.calls[0]["prompt"]
            assert "Cron Trigger" in prompt
            assert "HTTP Request" in prompt

        async def test_prompt_with_rag_is_longer_than_without(self):
            service_with, llm_with, _ = _build_service(seed=True)
            service_without, llm_without, _ = _build_service(seed=False)

            await service_with.generate(WORKFLOW)
            await service_without.generate(WORKFLOW)

            assert len(llm_with.calls[0]["prompt"]) > len(llm_without.calls[0]["prompt"])

        async def test_timeout_propagates_as_typed_error(self):
            service, llm, _ = _build_service()
            llm.raise_exc = OllamaTimeoutError("slow")

            with pytest.raises(OllamaTimeoutError):
                await service.generate(WORKFLOW)

        async def test_unavailable_propagates(self):
            service, llm, _ = _build_service()
            llm.raise_exc = OllamaUnavailableError("down")

            with pytest.raises(OllamaUnavailableError):
                await service.generate(WORKFLOW)

        async def test_invalid_json_response_raises_generation_error(self):
            service, _, _ = _build_service(llm_response="not json at all")

            with pytest.raises(DocumentationGenerationError):
                await service.generate(WORKFLOW)

        async def test_missing_required_section_raises_generation_error(self):
            partial = json.dumps({"objective": "x"})
            service, _, _ = _build_service(llm_response=partial)

            with pytest.raises(DocumentationGenerationError):
                await service.generate(WORKFLOW)
