"""W2.6 — payload size cap on /generate-docs."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.main import app


@pytest.fixture
def small_cap():
    original = settings.max_definition_bytes
    settings.max_definition_bytes = 500
    yield
    settings.max_definition_bytes = original


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_oversized_definition_is_rejected(client, small_cap):
    big = {"nodes": [{"type": "http", "label": "x" * 2000}]}
    resp = await client.post(
        "/generate-docs",
        json={"workflow_id": "w", "workflow_name": "W", "definition": big},
    )
    assert resp.status_code == 413
