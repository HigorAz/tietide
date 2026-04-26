import httpx
from fastapi import APIRouter, Depends

from src.config import settings
from src.state import ServiceState, get_service_state

router = APIRouter()


def _model_in_tags(payload: dict, target_model: str) -> bool:
    models = payload.get("models") or []
    target_base = target_model.split(":", 1)[0]
    for entry in models:
        name = (entry or {}).get("name") or ""
        if name == target_model or name.split(":", 1)[0] == target_base:
            return True
    return False


@router.get("/health")
async def health_check(state: ServiceState = Depends(get_service_state)):
    ollama_status = "disconnected"
    model_available = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                ollama_status = "connected"
                try:
                    model_available = _model_in_tags(resp.json(), settings.ollama_model)
                except ValueError:
                    model_available = False
    except httpx.RequestError:
        pass

    return {
        "status": "ok",
        "ollama": ollama_status,
        "model": settings.ollama_model,
        "model_available": model_available,
        "model_warmed_up": state.warmed_up,
        "warmup_error": state.warmup_error,
        "demo_cache_size": state.demo_cache.size(),
    }
