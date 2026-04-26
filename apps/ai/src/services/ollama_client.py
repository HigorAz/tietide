"""Async HTTP client for the Ollama /api/generate endpoint."""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)


class OllamaError(Exception):
    """Base class for Ollama client errors."""


class OllamaTimeoutError(OllamaError):
    """Raised when the model takes longer than the configured timeout."""


class OllamaUnavailableError(OllamaError):
    """Raised when Ollama is unreachable or returns a non-2xx response."""


class OllamaClient:
    """Thin async wrapper around Ollama's /api/generate.

    Uses httpx with a configurable transport so tests can swap in MockTransport.
    """

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout: float = 60.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self._transport = transport

    async def generate(
        self,
        prompt: str,
        *,
        temperature: float,
        max_tokens: int,
    ) -> str:
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        url = f"{self.base_url}/api/generate"

        try:
            async with httpx.AsyncClient(
                timeout=self.timeout,
                transport=self._transport,
            ) as client:
                response = await client.post(url, json=payload)
        except httpx.TimeoutException as exc:
            logger.warning("Ollama request timed out after %.1fs", self.timeout)
            raise OllamaTimeoutError("Ollama request timed out") from exc
        except httpx.RequestError as exc:
            logger.warning("Ollama connection error: %s", exc.__class__.__name__)
            raise OllamaUnavailableError("Ollama is unreachable") from exc

        if response.status_code >= 400:
            logger.warning("Ollama returned %d", response.status_code)
            raise OllamaUnavailableError(
                f"Ollama returned status {response.status_code}"
            )

        body = response.json()
        return body.get("response", "")
