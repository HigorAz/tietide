"""Integration tests for the POST /generate-docs route."""

from __future__ import annotations

import json

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app
from src.routes.docs import get_documentation_service
from src.services.documentation import DocumentationService
from src.services.ollama_client import OllamaTimeoutError, OllamaUnavailableError
from src.services.prompt import PromptBuilder
from src.services.retriever import Retriever
from tests.fakes import FakeEmbedder, FakeLlmClient, FakeVectorStore


SECTIONS = {
    "objective": "Manually call a health endpoint and surface the response.",
    "triggers": "Manual trigger started by a user.",
    "actions": "HTTP GET to https://api.example.com/health.",
    "data_flow": "trigger → http",
    "decisions": "No conditional logic.",
}


WORKFLOW_PAYLOAD = {
    "workflow_id": "wf-123",
    "workflow_name": "Manual Health Check",
    "definition": {
        "nodes": [
            {"id": "trigger", "type": "manual-trigger", "params": {}},
            {
                "id": "http",
                "type": "http-request",
                "params": {"url": "https://api.example.com/health"},
            },
        ],
        "edges": [{"from": "trigger", "to": "http"}],
    },
}


def _build_service(
    *,
    llm_response: str | None = None,
    raise_exc: Exception | None = None,
    seed: bool = True,
) -> tuple[DocumentationService, FakeLlmClient]:
    embedder = FakeEmbedder()
    store = FakeVectorStore()
    if seed:
        store.add(
            ids=["node:manual-trigger", "node:http-request"],
            documents=[
                "Node: Manual Trigger — fires on demand.",
                "Node: HTTP Request — performs an HTTP call.",
            ],
            metadatas=[
                {"source": "node_taxonomy", "node_type": "manual-trigger"},
                {"source": "node_taxonomy", "node_type": "http-request"},
            ],
            embeddings=[[0.0] * 8, [0.0] * 8],
        )
    retriever = Retriever(embedder=embedder, store=store, top_k=3)
    llm = FakeLlmClient(response=llm_response if llm_response is not None else json.dumps(SECTIONS))
    if raise_exc is not None:
        llm.raise_exc = raise_exc
    service = DocumentationService(
        retriever=retriever,
        prompt_builder=PromptBuilder(),
        llm_client=llm,
        temperature=0.3,
        max_tokens=1024,
    )
    return service, llm


@pytest.fixture
async def docs_client_factory():
    transports: list = []

    async def _factory(service: DocumentationService) -> AsyncClient:
        app.dependency_overrides[get_documentation_service] = lambda: service
        transport = ASGITransport(app=app)
        client = AsyncClient(transport=transport, base_url="http://test")
        transports.append(client)
        return client

    yield _factory

    for client in transports:
        await client.aclose()
    app.dependency_overrides.clear()


class TestGenerateDocsRoute:
    async def test_returns_structured_documentation(self, docs_client_factory):
        service, _ = _build_service()
        client = await docs_client_factory(service)

        response = await client.post("/generate-docs", json=WORKFLOW_PAYLOAD)

        assert response.status_code == 200
        body = response.json()
        assert body["workflow_id"] == "wf-123"
        assert body["sections"]["objective"] == SECTIONS["objective"]
        assert body["sections"]["triggers"] == SECTIONS["triggers"]
        assert body["sections"]["actions"] == SECTIONS["actions"]
        assert body["sections"]["data_flow"] == SECTIONS["data_flow"]
        assert body["sections"]["decisions"] == SECTIONS["decisions"]
        assert "Manual Health Check" in body["documentation"]

    async def test_documentation_includes_all_required_sections(self, docs_client_factory):
        service, _ = _build_service()
        client = await docs_client_factory(service)

        response = await client.post("/generate-docs", json=WORKFLOW_PAYLOAD)

        assert response.status_code == 200
        markdown = response.json()["documentation"]
        for header in ("## Objective", "## Triggers", "## Actions", "## Data Flow", "## Decisions"):
            assert header in markdown

    async def test_rag_context_is_used_in_prompt(self, docs_client_factory):
        service_with, llm_with = _build_service(seed=True)
        service_without, llm_without = _build_service(seed=False)
        client_with = await docs_client_factory(service_with)

        response = await client_with.post("/generate-docs", json=WORKFLOW_PAYLOAD)
        assert response.status_code == 200

        # Issue a second request with the empty-context service
        client_without = await docs_client_factory(service_without)
        response2 = await client_without.post("/generate-docs", json=WORKFLOW_PAYLOAD)
        assert response2.status_code == 200

        prompt_with = llm_with.calls[0]["prompt"]
        prompt_without = llm_without.calls[0]["prompt"]
        assert "Manual Trigger" in prompt_with
        assert len(prompt_with) > len(prompt_without)

    async def test_timeout_returns_503(self, docs_client_factory):
        service, _ = _build_service(raise_exc=OllamaTimeoutError("slow"))
        client = await docs_client_factory(service)

        response = await client.post("/generate-docs", json=WORKFLOW_PAYLOAD)

        assert response.status_code == 503
        body = response.json()
        assert "unavailable" in body["detail"].lower() or "timeout" in body["detail"].lower()

    async def test_unavailable_returns_503(self, docs_client_factory):
        service, _ = _build_service(raise_exc=OllamaUnavailableError("down"))
        client = await docs_client_factory(service)

        response = await client.post("/generate-docs", json=WORKFLOW_PAYLOAD)

        assert response.status_code == 503

    async def test_invalid_request_payload_returns_422(self, docs_client_factory):
        service, _ = _build_service()
        client = await docs_client_factory(service)

        response = await client.post("/generate-docs", json={"workflow_id": "x"})

        assert response.status_code == 422

    async def test_uses_temperature_and_max_tokens(self, docs_client_factory):
        service, llm = _build_service()
        client = await docs_client_factory(service)

        response = await client.post("/generate-docs", json=WORKFLOW_PAYLOAD)

        assert response.status_code == 200
        assert llm.calls[0]["temperature"] == 0.3
        assert llm.calls[0]["max_tokens"] == 1024
