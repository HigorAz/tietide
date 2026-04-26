"""ChromaDB vector store wrapper used by the ingestion and retrieval services."""

from __future__ import annotations

import logging
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class VectorStore(Protocol):
    collection_name: str

    def reset_collection(self) -> None: ...
    def add(
        self,
        ids: list[str],
        documents: list[str],
        metadatas: list[dict[str, Any]],
        embeddings: list[list[float]],
    ) -> None: ...
    def count(self) -> int: ...
    def query(
        self,
        embedding: list[float],
        n_results: int,
    ) -> list[dict[str, Any]]: ...


class ChromaVectorStore:
    """Persistent ChromaDB-backed store. Lazily connects on first use."""

    def __init__(
        self,
        host: str,
        port: int,
        collection_name: str,
    ) -> None:
        self.host = host
        self.port = port
        self.collection_name = collection_name
        self._client = None
        self._collection = None

    def reset_collection(self) -> None:
        client = self._get_client()
        try:
            client.delete_collection(name=self.collection_name)
        except Exception:
            logger.debug("Collection %s did not exist; creating fresh", self.collection_name)
        self._collection = client.create_collection(name=self.collection_name)

    def add(
        self,
        ids: list[str],
        documents: list[str],
        metadatas: list[dict[str, Any]],
        embeddings: list[list[float]],
    ) -> None:
        if not ids:
            return
        collection = self._get_collection()
        collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings,
        )

    def count(self) -> int:
        return self._get_collection().count()

    def query(
        self,
        embedding: list[float],
        n_results: int,
    ) -> list[dict[str, Any]]:
        collection = self._get_collection()
        result = collection.query(query_embeddings=[embedding], n_results=n_results)
        ids = (result.get("ids") or [[]])[0]
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        return [
            {
                "id": ids[i],
                "document": documents[i] if i < len(documents) else "",
                "metadata": metadatas[i] if i < len(metadatas) else {},
                "distance": distances[i] if i < len(distances) else None,
            }
            for i in range(len(ids))
        ]

    def _get_client(self):
        if self._client is None:
            import chromadb

            self._client = chromadb.HttpClient(host=self.host, port=self.port)
        return self._client

    def _get_collection(self):
        if self._collection is None:
            client = self._get_client()
            self._collection = client.get_or_create_collection(name=self.collection_name)
        return self._collection
