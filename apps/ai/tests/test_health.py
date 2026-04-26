import pytest
from httpx import AsyncClient

from src.services.documentation import DocumentationSections, GeneratedDocumentation
from src.state import get_service_state


def _make_dummy_doc() -> GeneratedDocumentation:
    return GeneratedDocumentation(
        workflow_id="demo-1",
        workflow_name="D",
        sections=DocumentationSections(
            objective="o", triggers="t", actions="a", data_flow="d", decisions="x"
        ),
        documentation="# md",
    )


@pytest.fixture(autouse=True)
def _reset_state():
    state = get_service_state()
    state.warmed_up = False
    state.warmup_error = None
    state.demo_cache.clear()
    yield
    state.warmed_up = False
    state.warmup_error = None
    state.demo_cache.clear()


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "ollama" in data
    assert "model" in data
    assert "model_warmed_up" in data
    assert "demo_cache_size" in data


@pytest.mark.asyncio
async def test_health_reflects_warmup_state(client: AsyncClient):
    state = get_service_state()
    state.warmed_up = True

    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["model_warmed_up"] is True


@pytest.mark.asyncio
async def test_health_exposes_warmup_error_when_present(client: AsyncClient):
    state = get_service_state()
    state.warmed_up = False
    state.warmup_error = "ollama unreachable"

    response = await client.get("/health")

    body = response.json()
    assert body["model_warmed_up"] is False
    assert body["warmup_error"] == "ollama unreachable"


@pytest.mark.asyncio
async def test_health_reports_demo_cache_size(client: AsyncClient):
    state = get_service_state()
    state.demo_cache.register(
        {"workflow_id": "demo-1", "workflow_name": "D", "definition": {}},
        _make_dummy_doc(),
    )

    response = await client.get("/health")

    assert response.json()["demo_cache_size"] == 1
