"""In-memory cache of pre-generated documentation for demo workflows."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from src.services.documentation import GeneratedDocumentation


class DemoDocumentationCache:
    """Maps a workflow payload (stable hash) to its pre-generated documentation."""

    def __init__(self) -> None:
        self._entries: dict[str, GeneratedDocumentation] = {}

    @staticmethod
    def _key(workflow: dict[str, Any]) -> str:
        canonical = json.dumps(
            {
                "workflow_id": workflow.get("workflow_id"),
                "workflow_name": workflow.get("workflow_name"),
                "definition": workflow.get("definition"),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def register(self, workflow: dict[str, Any], doc: GeneratedDocumentation) -> None:
        self._entries[self._key(workflow)] = doc

    def get(self, workflow: dict[str, Any]) -> GeneratedDocumentation | None:
        return self._entries.get(self._key(workflow))

    def size(self) -> int:
        return len(self._entries)

    def clear(self) -> None:
        self._entries.clear()
