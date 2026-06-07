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
        keep_alive: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        # How long Ollama keeps the model resident after a request. Without it the
        # model is evicted after the default ~5min idle and cold-loaded (4.7GB on
        # CPU) on the next call. e.g. "30m" or "-1" to keep loaded indefinitely.
        self.keep_alive = keep_alive
        self._transport = transport

    async def generate(
        self,
        prompt: str,
        *,
        temperature: float,
        max_tokens: int,
        format_schema: dict | None = None,
    ) -> str:
        # A JSON schema constrains decoding to the exact shape (Ollama >= 0.5);
        # otherwise fall back to free-form JSON mode.
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": format_schema if format_schema is not None else "json",
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        if self.keep_alive is not None:
            payload["keep_alive"] = self.keep_alive
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
