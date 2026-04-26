"""Unit tests for the model warm-up helper."""

from __future__ import annotations

from src.services.ollama_client import OllamaTimeoutError, OllamaUnavailableError
from src.services.warmup import warm_up_model
from tests.fakes import FakeLlmClient


class TestWarmUpModel:
    async def test_returns_success_when_model_responds(self):
        llm = FakeLlmClient(response="ok")
        result = await warm_up_model(llm)

        assert result.success is True
        assert result.error is None
        assert llm.calls

    async def test_returns_failure_on_timeout(self):
        llm = FakeLlmClient(response="ok")
        llm.raise_exc = OllamaTimeoutError("slow")

        result = await warm_up_model(llm)

        assert result.success is False
        assert result.error and "timeout" in result.error.lower()

    async def test_returns_failure_when_unavailable(self):
        llm = FakeLlmClient(response="ok")
        llm.raise_exc = OllamaUnavailableError("down")

        result = await warm_up_model(llm)

        assert result.success is False
        assert result.error and result.error.strip()

    async def test_uses_minimal_token_budget_to_finish_fast(self):
        llm = FakeLlmClient(response="ok")
        await warm_up_model(llm)

        call = llm.calls[0]
        assert call["max_tokens"] <= 16
        assert call["temperature"] == 0.0
        assert len(call["prompt"]) > 0
