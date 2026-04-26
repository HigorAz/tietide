"""Ingestion pipeline that loads node taxonomy and example workflows into ChromaDB."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.services.embeddings import Embedder
from src.services.vector_store import VectorStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IngestionReport:
    collection: str
    taxonomy_count: int
    examples_count: int

    @property
    def total(self) -> int:
        return self.taxonomy_count + self.examples_count

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "collection": self.collection,
            "taxonomy_count": self.taxonomy_count,
            "examples_count": self.examples_count,
            "total": self.total,
        }


@dataclass(frozen=True)
class _Document:
    id: str
    text: str
    metadata: dict[str, Any]


class IngestionService:
    """Loads taxonomy and example documents, embeds them, and stores them in ChromaDB."""

    def __init__(
        self,
        embedder: Embedder,
        store: VectorStore,
        data_dir: Path | None = None,
    ) -> None:
        self.embedder = embedder
        self.store = store
        self.data_dir = data_dir or Path(__file__).resolve().parents[1] / "data"

    def run(self) -> IngestionReport:
        if not self.data_dir.exists():
            raise FileNotFoundError(f"Ingestion data directory not found: {self.data_dir}")

        taxonomy_docs = self._load_taxonomy_documents()
        example_docs = self._load_example_documents()
        all_docs = taxonomy_docs + example_docs

        logger.info(
            "Resetting collection %s and ingesting %d documents (%d taxonomy, %d examples)",
            self.store.collection_name,
            len(all_docs),
            len(taxonomy_docs),
            len(example_docs),
        )
        self.store.reset_collection()
        self._embed_and_store(all_docs)

        return IngestionReport(
            collection=self.store.collection_name,
            taxonomy_count=len(taxonomy_docs),
            examples_count=len(example_docs),
        )

    def _embed_and_store(self, docs: list[_Document]) -> None:
        if not docs:
            return
        embeddings = self.embedder.embed([doc.text for doc in docs])
        self.store.add(
            ids=[doc.id for doc in docs],
            documents=[doc.text for doc in docs],
            metadatas=[doc.metadata for doc in docs],
            embeddings=embeddings,
        )

    def _load_taxonomy_documents(self) -> list[_Document]:
        taxonomy_path = self.data_dir / "node_taxonomy.json"
        if not taxonomy_path.exists():
            return []

        payload = json.loads(taxonomy_path.read_text(encoding="utf-8"))
        nodes = payload.get("nodes", [])
        return [self._taxonomy_doc(node) for node in nodes]

    def _load_example_documents(self) -> list[_Document]:
        examples_dir = self.data_dir / "examples"
        if not examples_dir.exists():
            return []

        documents: list[_Document] = []
        for path in sorted(examples_dir.glob("*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            documents.append(self._example_doc(path.stem, payload))
        return documents

    @staticmethod
    def _taxonomy_doc(node: dict[str, Any]) -> _Document:
        node_type = node["type"]
        text = (
            f"Node: {node['name']} (type: {node_type}, category: {node['category']}).\n"
            f"Description: {node['description']}\n"
            f"Parameters: {json.dumps(node.get('params', {}), ensure_ascii=False)}\n"
            f"Outputs: {', '.join(node.get('outputs', [])) or 'none'}\n"
            f"Use cases: {'; '.join(node.get('use_cases', [])) or 'general purpose'}"
        )
        return _Document(
            id=f"node:{node_type}",
            text=text,
            metadata={
                "source": "node_taxonomy",
                "node_type": node_type,
                "category": node["category"],
                "name": node["name"],
            },
        )

    @staticmethod
    def _example_doc(stem: str, payload: dict[str, Any]) -> _Document:
        definition = payload.get("definition", {})
        text = (
            f"Workflow: {payload.get('name', stem)}\n"
            f"Summary: {payload.get('description', '')}\n"
            f"Definition: {json.dumps(definition, ensure_ascii=False)}"
        )
        return _Document(
            id=f"example:{stem}",
            text=text,
            metadata={
                "source": "example_workflow",
                "name": payload.get("name", stem),
                "expected_documentation": payload.get("expected_documentation", ""),
            },
        )
