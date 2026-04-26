"""Tests for the lifespan bootstrap helper."""

from __future__ import annotations

import json
from typing import Any

from src.lifespan import bootstrap
from src.services.documentation import (
    DocumentationGenerationError,
    DocumentationSections,
    DocumentationService,
    GeneratedDocumentation,
)
from src.services.ollama_client import OllamaUnavailableError
from src.services.prompt import PromptBuilder
from src.services.retriever import Retriever
from src.state import ServiceState
from tests.fakes import FakeEmbedder, FakeLlmClient, FakeVectorStore


SECTIONS_JSON = json.dumps(
    {
        "objective": "o",
        "triggers": "t",
        "actions": "a",
        "data_flow": "d",
        "decisions": "x",
    }
)


def _make_doc_service(response: str = SECTIONS_JSON) -> tuple[DocumentationService, FakeLlmClient]:
    embedder = FakeEmbedder()
    store = FakeVectorStore()
    retriever = Retriever(embedder=embedder, store=store, top_k=3)
    llm = FakeLlmClient(response=response)
    service = DocumentationService(
        retriever=retriever,
        prompt_builder=PromptBuilder(),
        llm_client=llm,
        temperature=0.3,
        max_tokens=1024,
    )
    return service, llm


class TestBootstrap:
    async def test_marks_state_warmed_up_when_llm_responds(self):
        state = ServiceState()
        warmup_llm = FakeLlmClient(response="ok")
        service, _ = _make_doc_service()

        await bootstrap(
            state,
            llm_client=warmup_llm,
            demo_workflows=[],
            doc_service=service,
        )

        assert state.warmed_up is True
        assert state.warmup_error is None

    async def test_does_not_crash_when_llm_unavailable(self):
        state = ServiceState()
        warmup_llm = FakeLlmClient(response="ok")
        warmup_llm.raise_exc = OllamaUnavailableError("down")
        service, _ = _make_doc_service()

        await bootstrap(
            state,
            llm_client=warmup_llm,
            demo_workflows=[],
            doc_service=service,
        )

        assert state.warmed_up is False
        assert state.warmup_error and state.warmup_error.strip()

    async def test_primes_demo_cache_for_each_workflow(self):
        state = ServiceState()
        warmup_llm = FakeLlmClient(response="ok")
        service, doc_llm = _make_doc_service()
        demos = [
            {
                "workflow_id": "demo-1",
                "workflow_name": "Demo 1",
                "definition": {"nodes": []},
            },
            {
                "workflow_id": "demo-2",
                "workflow_name": "Demo 2",
                "definition": {"nodes": []},
            },
        ]

        await bootstrap(
            state,
            llm_client=warmup_llm,
            demo_workflows=demos,
            doc_service=service,
        )

        assert state.demo_cache.size() == 2
        for wf in demos:
            assert state.demo_cache.get(wf) is not None
        assert len(doc_llm.calls) == 2

    async def test_demo_prime_skipped_when_warmup_failed(self):
        state = ServiceState()
        warmup_llm = FakeLlmClient(response="ok")
        warmup_llm.raise_exc = OllamaUnavailableError("down")
        service, doc_llm = _make_doc_service()
        demos = [
            {
                "workflow_id": "demo-1",
                "workflow_name": "Demo 1",
                "definition": {"nodes": []},
            },
        ]

        await bootstrap(
            state,
            llm_client=warmup_llm,
            demo_workflows=demos,
            doc_service=service,
        )

        assert state.demo_cache.size() == 0
        assert len(doc_llm.calls) == 0

    async def test_demo_prime_continues_on_per_workflow_failure(self):
        state = ServiceState()
        warmup_llm = FakeLlmClient(response="ok")

        class FlakyService:
            def __init__(self) -> None:
                self.calls = 0

            async def generate(self, workflow: dict[str, Any]) -> GeneratedDocumentation:
                self.calls += 1
                if self.calls == 1:
                    raise DocumentationGenerationError("bad output")
                return GeneratedDocumentation(
                    workflow_id=str(workflow["workflow_id"]),
                    workflow_name=str(workflow["workflow_name"]),
                    sections=DocumentationSections(
                        objective="o",
                        triggers="t",
                        actions="a",
                        data_flow="d",
                        decisions="x",
                    ),
                    documentation="# md",
                )

        service = FlakyService()
        demos = [
            {"workflow_id": "1", "workflow_name": "A", "definition": {}},
            {"workflow_id": "2", "workflow_name": "B", "definition": {}},
        ]

        await bootstrap(
            state,
            llm_client=warmup_llm,
            demo_workflows=demos,
            doc_service=service,
        )

        assert state.demo_cache.size() == 1
