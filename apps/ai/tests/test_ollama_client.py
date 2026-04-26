"""Unit tests for the Ollama HTTP client."""

from __future__ import annotations

import json

import httpx
import pytest

from src.services.ollama_client import OllamaClient, OllamaTimeoutError, OllamaUnavailableError


class TestOllamaClient:
    class TestGenerate:
        async def test_sends_expected_payload(self):
            captured: dict = {}

            def handler(request: httpx.Request) -> httpx.Response:
                captured["url"] = str(request.url)
                captured["body"] = json.loads(request.content)
                return httpx.Response(200, json={"response": "the answer", "done": True})

            transport = httpx.MockTransport(handler)
            client = OllamaClient(
                base_url="http://ollama:11434",
                model="llama3.1:8b",
                timeout=10.0,
                transport=transport,
            )

            result = await client.generate("Generate docs", temperature=0.3, max_tokens=1024)

            assert result == "the answer"
            assert captured["url"] == "http://ollama:11434/api/generate"
            body = captured["body"]
            assert body["model"] == "llama3.1:8b"
            assert body["prompt"] == "Generate docs"
            assert body["stream"] is False
            assert body["options"]["temperature"] == 0.3
            assert body["options"]["num_predict"] == 1024

        async def test_requests_json_format(self):
            captured: dict = {}

            def handler(request: httpx.Request) -> httpx.Response:
                captured["body"] = json.loads(request.content)
                return httpx.Response(200, json={"response": "{}", "done": True})

            transport = httpx.MockTransport(handler)
            client = OllamaClient(
                base_url="http://ollama:11434",
                model="llama3.1:8b",
                timeout=10.0,
                transport=transport,
            )

            await client.generate("p", temperature=0.3, max_tokens=1024)

            assert captured["body"].get("format") == "json"

        async def test_timeout_raises_typed_error(self):
            def handler(request: httpx.Request) -> httpx.Response:
                raise httpx.ReadTimeout("slow", request=request)

            transport = httpx.MockTransport(handler)
            client = OllamaClient(
                base_url="http://ollama:11434",
                model="llama3.1:8b",
                timeout=0.5,
                transport=transport,
            )

            with pytest.raises(OllamaTimeoutError):
                await client.generate("p", temperature=0.3, max_tokens=1024)

        async def test_non_2xx_raises_unavailable(self):
            def handler(request: httpx.Request) -> httpx.Response:
                return httpx.Response(500, json={"error": "boom"})

            transport = httpx.MockTransport(handler)
            client = OllamaClient(
                base_url="http://ollama:11434",
                model="llama3.1:8b",
                timeout=10.0,
                transport=transport,
            )

            with pytest.raises(OllamaUnavailableError):
                await client.generate("p", temperature=0.3, max_tokens=1024)

        async def test_connection_error_raises_unavailable(self):
            def handler(request: httpx.Request) -> httpx.Response:
                raise httpx.ConnectError("refused", request=request)

            transport = httpx.MockTransport(handler)
            client = OllamaClient(
                base_url="http://ollama:11434",
                model="llama3.1:8b",
                timeout=10.0,
                transport=transport,
            )

            with pytest.raises(OllamaUnavailableError):
                await client.generate("p", temperature=0.3, max_tokens=1024)
