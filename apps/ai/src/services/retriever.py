"""RAG retriever — embeds a query and pulls top-K similar documents from the vector store."""

from __future__ import annotations

import logging
from typing import Any, Protocol

from src.services.embeddings import Embedder

logger = logging.getLogger(__name__)


class QueryableStore(Protocol):
    def query(
        self,
        embedding: list[float],
        n_results: int,
    ) -> list[dict[str, Any]]: ...


class Retriever:
    """Embeds a text query and returns the top-K closest documents."""

    def __init__(
        self,
        *,
        embedder: Embedder,
        store: QueryableStore,
        top_k: int = 4,
    ) -> None:
        self.embedder = embedder
        self.store = store
        self.top_k = top_k

    def retrieve(self, query: str) -> list[dict[str, Any]]:
        if not query:
            return []
        vectors = self.embedder.embed([query])
        if not vectors:
            return []
        return self.store.query(embedding=vectors[0], n_results=self.top_k)
