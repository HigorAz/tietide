"""Documentation generation orchestration: retrieve → prompt → LLM → parse."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol

from src.services.prompt import PromptBuilder
from src.services.retriever import Retriever
from src.services.sections import SECTION_KEYS, SECTION_TITLES

logger = logging.getLogger(__name__)

REQUIRED_SECTIONS: tuple[str, ...] = SECTION_KEYS


class DocumentationGenerationError(Exception):
    """Raised when the LLM response cannot be parsed into structured documentation."""


class LlmClient(Protocol):
    async def generate(
        self,
        prompt: str,
        *,
        temperature: float,
        max_tokens: int,
    ) -> str: ...


@dataclass(frozen=True)
class DocumentationSections:
    overview: str
    prerequisites: str
    trigger: str
    walkthrough: str
    data_flow: str
    decisions: str
    error_handling: str

    def as_dict(self) -> dict[str, str]:
        return {key: getattr(self, key) for key in SECTION_KEYS}


@dataclass(frozen=True)
class GeneratedDocumentation:
    workflow_id: str
    workflow_name: str
    sections: DocumentationSections
    documentation: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "workflow_name": self.workflow_name,
            "sections": self.sections.as_dict(),
            "documentation": self.documentation,
        }


class DocumentationService:
    """Orchestrates RAG retrieval, prompt building, LLM call, and structured parsing."""

    def __init__(
        self,
        *,
        retriever: Retriever,
        prompt_builder: PromptBuilder,
        llm_client: LlmClient,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        max_concurrency: int = 1,
    ) -> None:
        self.retriever = retriever
        self.prompt_builder = prompt_builder
        self.llm_client = llm_client
        self.temperature = temperature
        self.max_tokens = max_tokens
        # Ollama serves one generation at a time; serialize calls here so two
        # concurrent doc requests queue cleanly instead of overlapping and
        # racing the request timeout (which surfaced as a 503). Created lazily
        # so it binds to the running event loop on first use.
        self._max_concurrency = max_concurrency
        self._llm_semaphore: asyncio.Semaphore | None = None

    def _semaphore(self) -> asyncio.Semaphore:
        if self._llm_semaphore is None:
            self._llm_semaphore = asyncio.Semaphore(self._max_concurrency)
        return self._llm_semaphore

    async def generate(self, workflow: dict[str, Any]) -> GeneratedDocumentation:
        workflow_id = str(workflow.get("workflow_id", ""))
        workflow_name = str(workflow.get("workflow_name") or workflow.get("name") or "Workflow")

        query = self._build_retrieval_query(workflow_name, workflow.get("definition", {}))
        context_docs = self.retriever.retrieve(query)

        facts = workflow.get("facts")
        prompt = self.prompt_builder.build(
            workflow=workflow, context_docs=context_docs, facts=facts
        )
        async with self._semaphore():
            raw = await self.llm_client.generate(
                prompt,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )

        sections = self._parse_sections(raw)
        markdown = self._render_markdown(workflow_name, sections)

        return GeneratedDocumentation(
            workflow_id=workflow_id,
            workflow_name=workflow_name,
            sections=sections,
            documentation=markdown,
        )

    @staticmethod
    def _build_retrieval_query(name: str, definition: dict[str, Any]) -> str:
        node_types = sorted({n.get("type", "") for n in definition.get("nodes", []) if n.get("type")})
        types_str = ", ".join(node_types) if node_types else "no node types"
        return f"Workflow {name} using nodes: {types_str}"

    @staticmethod
    def _parse_sections(raw: str) -> DocumentationSections:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise DocumentationGenerationError(
                "Model response was not valid JSON"
            ) from exc

        if not isinstance(payload, dict):
            raise DocumentationGenerationError("Model response was not a JSON object")

        missing = [key for key in REQUIRED_SECTIONS if key not in payload]
        if missing:
            raise DocumentationGenerationError(
                f"Model response missing required sections: {', '.join(missing)}"
            )

        return DocumentationSections(**{key: str(payload[key]) for key in SECTION_KEYS})

    @staticmethod
    def _render_markdown(name: str, sections: DocumentationSections) -> str:
        body = "".join(
            f"## {SECTION_TITLES[key]}\n{getattr(sections, key)}\n\n" for key in SECTION_KEYS
        )
        return f"# {name}\n\n{body}".rstrip() + "\n"
