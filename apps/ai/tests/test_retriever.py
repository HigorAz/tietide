"""Unit tests for the RAG retriever service."""

from __future__ import annotations

from src.services.retriever import Retriever
from tests.fakes import FakeEmbedder, FakeVectorStore


def _seed(store: FakeVectorStore, n: int = 5) -> None:
    store.add(
        ids=[f"doc-{i}" for i in range(n)],
        documents=[f"document body {i}" for i in range(n)],
        metadatas=[{"source": "node_taxonomy", "idx": i} for i in range(n)],
        embeddings=[[0.0] * 8 for _ in range(n)],
    )


class TestRetriever:
    class TestRetrieve:
        def test_embeds_query_then_queries_store(self):
            embedder = FakeEmbedder()
            store = FakeVectorStore()
            _seed(store, n=5)
            retriever = Retriever(embedder=embedder, store=store, top_k=3)

            results = retriever.retrieve("a workflow with cron trigger")

            assert len(results) == 3
            assert embedder.calls == [["a workflow with cron trigger"]]
            assert store.last_n_results == 3
            assert len(store.last_query) == embedder.dim

        def test_returns_documents_with_metadata(self):
            embedder = FakeEmbedder()
            store = FakeVectorStore()
            _seed(store, n=5)
            retriever = Retriever(embedder=embedder, store=store, top_k=2)

            results = retriever.retrieve("query")

            for record in results:
                assert "id" in record
                assert "document" in record
                assert "metadata" in record

        def test_empty_store_returns_empty_list(self):
            embedder = FakeEmbedder()
            store = FakeVectorStore()
            retriever = Retriever(embedder=embedder, store=store, top_k=4)

            results = retriever.retrieve("anything")

            assert results == []

        def test_top_k_caps_results(self):
            embedder = FakeEmbedder()
            store = FakeVectorStore()
            _seed(store, n=10)
            retriever = Retriever(embedder=embedder, store=store, top_k=4)

            results = retriever.retrieve("query")

            assert len(results) == 4
