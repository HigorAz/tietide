"""In-memory test doubles for embedding, vector store, and LLM services."""

from __future__ import annotations

from typing import Any


class FakeEmbedder:
    """Deterministic embedder that returns vectors derived from input length.

    Avoids loading the real sentence-transformers model in unit tests.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", dim: int = 8) -> None:
        self.model_name = model_name
        self.dim = dim
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return [[float((len(text) + i) % 7) / 7.0 for i in range(self.dim)] for text in texts]


class FakeVectorStore:
    """In-memory stand-in for ChromaDB with the same surface used by the service."""

    def __init__(self, collection_name: str = "tietide_docs") -> None:
        self.collection_name = collection_name
        self.records: list[dict[str, Any]] = []
        self.reset_count = 0

    def reset_collection(self) -> None:
        self.reset_count += 1
        self.records = []

    def add(
        self,
        ids: list[str],
        documents: list[str],
        metadatas: list[dict[str, Any]],
        embeddings: list[list[float]],
    ) -> None:
        for i, doc_id in enumerate(ids):
            self.records.append(
                {
                    "id": doc_id,
                    "document": documents[i],
                    "metadata": metadatas[i],
                    "embedding": embeddings[i],
                }
            )

    def count(self) -> int:
        return len(self.records)

    def filter(self, **predicate: Any) -> list[dict[str, Any]]:
        def matches(record: dict[str, Any]) -> bool:
            return all(record["metadata"].get(k) == v for k, v in predicate.items())

        return [r for r in self.records if matches(r)]

    def query(
        self,
        embedding: list[float],
        n_results: int,
    ) -> list[dict[str, Any]]:
        """Deterministic top-N query — returns the first n_results records.

        Real ChromaDB ranks by cosine similarity; for tests we just return
        records in insertion order so behavior is predictable.
        """
        self.last_query: list[float] = list(embedding)
        self.last_n_results = n_results
        return [
            {
                "id": record["id"],
                "document": record["document"],
                "metadata": record["metadata"],
                "distance": 0.1 * (i + 1),
            }
            for i, record in enumerate(self.records[:n_results])
        ]


class FakeLlmClient:
    """Records prompts and returns a configurable response."""

    def __init__(self, response: str = '{}', model: str = "test-model") -> None:
        self.model = model
        self.response = response
        self.calls: list[dict[str, Any]] = []
        self.raise_exc: Exception | None = None

    async def generate(self, prompt: str, *, temperature: float, max_tokens: int) -> str:
        self.calls.append(
            {"prompt": prompt, "temperature": temperature, "max_tokens": max_tokens}
        )
        if self.raise_exc is not None:
            raise self.raise_exc
        return self.response
