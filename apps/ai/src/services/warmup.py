"""Model warm-up helper — sends a tiny request so first user latency is low."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Protocol

from src.services.ollama_client import OllamaTimeoutError, OllamaUnavailableError

logger = logging.getLogger(__name__)


WARMUP_PROMPT = "Reply with the single word: ready."
WARMUP_MAX_TOKENS = 8
WARMUP_TEMPERATURE = 0.0


class _LlmClient(Protocol):
    async def generate(
        self,
        prompt: str,
        *,
        temperature: float,
        max_tokens: int,
    ) -> str: ...


@dataclass(frozen=True)
class WarmupResult:
    success: bool
    error: str | None = None
    duration_ms: int = 0


async def warm_up_model(llm_client: _LlmClient) -> WarmupResult:
    """Send a tiny generate request so the model is loaded into memory.

    Catches Ollama errors so a missing model never crashes startup.
    """
    started = time.perf_counter()
    try:
        await llm_client.generate(
            WARMUP_PROMPT,
            temperature=WARMUP_TEMPERATURE,
            max_tokens=WARMUP_MAX_TOKENS,
        )
    except OllamaTimeoutError:
        duration_ms = int((time.perf_counter() - started) * 1000)
        logger.warning("Model warm-up timed out after %dms", duration_ms)
        return WarmupResult(success=False, error="timeout", duration_ms=duration_ms)
    except OllamaUnavailableError as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        logger.warning("Model warm-up failed: %s", exc)
        return WarmupResult(success=False, error=str(exc) or "unavailable", duration_ms=duration_ms)

    duration_ms = int((time.perf_counter() - started) * 1000)
    logger.info("Model warm-up completed in %dms", duration_ms)
    return WarmupResult(success=True, error=None, duration_ms=duration_ms)
