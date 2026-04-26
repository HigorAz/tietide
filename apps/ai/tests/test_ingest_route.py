"""Integration tests for the POST /ingest route."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app
from src.routes.ingest import get_ingestion_service
from src.services.ingestion import IngestionService
from tests.fakes import FakeEmbedder, FakeVectorStore


@pytest.fixture
def fake_store() -> FakeVectorStore:
    return FakeVectorStore()


@pytest.fixture
def fake_embedder() -> FakeEmbedder:
    return FakeEmbedder()


@pytest.fixture
async def ingest_client(fake_embedder: FakeEmbedder, fake_store: FakeVectorStore):
    service = IngestionService(embedder=fake_embedder, store=fake_store)
    app.dependency_overrides[get_ingestion_service] = lambda: service
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_ingest_returns_counts_and_status(ingest_client: AsyncClient):
    response = await ingest_client.post("/ingest")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["taxonomy_count"] == 4
    assert body["examples_count"] >= 3
    assert body["total"] == body["taxonomy_count"] + body["examples_count"]


@pytest.mark.asyncio
async def test_ingest_resets_and_populates_store(
    ingest_client: AsyncClient, fake_store: FakeVectorStore
):
    fake_store.records.append({"id": "stale", "document": "x", "metadata": {}, "embedding": []})

    response = await ingest_client.post("/ingest")

    assert response.status_code == 200
    assert fake_store.reset_count == 1
    assert all(record["id"] != "stale" for record in fake_store.records)
    assert fake_store.count() == response.json()["total"]


@pytest.mark.asyncio
async def test_ingest_invokes_embedder(ingest_client: AsyncClient, fake_embedder: FakeEmbedder):
    response = await ingest_client.post("/ingest")

    assert response.status_code == 200
    assert sum(len(call) for call in fake_embedder.calls) == response.json()["total"]
