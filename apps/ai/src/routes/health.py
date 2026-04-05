import httpx
from fastapi import APIRouter

from src.config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    ollama_status = "disconnected"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                ollama_status = "connected"
    except httpx.RequestError:
        pass

    return {
        "status": "ok",
        "ollama": ollama_status,
        "model": settings.ollama_model,
    }
