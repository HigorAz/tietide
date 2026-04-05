import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "ollama" in data
    assert "model" in data


@pytest.mark.asyncio
async def test_generate_docs_stub(client: AsyncClient):
    response = await client.post(
        "/generate-docs",
        json={
            "workflow_id": "test-id",
            "workflow_name": "Test Workflow",
            "definition": {"nodes": [], "edges": []},
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["workflow_id"] == "test-id"
    assert "documentation" in data
