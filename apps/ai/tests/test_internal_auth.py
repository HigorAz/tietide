"""W2.5 — internal shared-token auth on /ingest and /generate-docs."""

from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.main import app
from src.routes.ingest import get_ingestion_service


@pytest.fixture
def with_token():
    original = settings.internal_ai_token
    settings.internal_ai_token = "s3cr3t-internal-token"
    yield "s3cr3t-internal-token"
    settings.internal_ai_token = original


@pytest.fixture
def mock_ingestion_service():
    service = MagicMock()
    service.run.return_value = type(
        "Report", (), {"as_dict": lambda self: {"ingested": 1, "skipped": 0}}
    )()
    app.dependency_overrides[get_ingestion_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_ingestion_service, None)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_ingest_open_when_token_unset(client, mock_ingestion_service):
    # Default settings have an empty token → auth disabled (dev/test convenience).
    resp = await client.post("/ingest")
    assert resp.status_code == 200


async def test_ingest_rejected_without_token_when_required(
    client, mock_ingestion_service, with_token
):
    resp = await client.post("/ingest")
    assert resp.status_code == 401


async def test_ingest_rejected_with_wrong_token(client, mock_ingestion_service, with_token):
    resp = await client.post("/ingest", headers={"X-Internal-Token": "wrong"})
    assert resp.status_code == 401


async def test_ingest_accepted_with_correct_token(client, mock_ingestion_service, with_token):
    resp = await client.post("/ingest", headers={"X-Internal-Token": with_token})
    assert resp.status_code == 200


async def test_generate_docs_requires_token_when_set(client, with_token):
    # No header → rejected before the heavy pipeline runs.
    resp = await client.post(
        "/generate-docs",
        json={"workflow_id": "w", "workflow_name": "W", "definition": {"nodes": []}},
    )
    assert resp.status_code == 401
