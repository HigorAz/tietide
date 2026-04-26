"""Unit tests for the ingestion service — taxonomy and example loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.services.ingestion import IngestionService
from tests.fakes import FakeEmbedder, FakeVectorStore


DATA_DIR = Path(__file__).resolve().parents[1] / "src" / "data"


def make_service(data_dir: Path | None = None) -> tuple[IngestionService, FakeEmbedder, FakeVectorStore]:
    embedder = FakeEmbedder()
    store = FakeVectorStore()
    service = IngestionService(
        embedder=embedder,
        store=store,
        data_dir=data_dir or DATA_DIR,
    )
    return service, embedder, store


class TestIngestionService:
    class TestRun:
        def test_resets_collection_before_loading(self):
            service, _, store = make_service()
            store.records = [{"id": "stale", "document": "old", "metadata": {}, "embedding": []}]

            service.run()

            assert store.reset_count == 1
            assert all(record["id"] != "stale" for record in store.records)

        def test_loads_node_taxonomy_into_store(self):
            service, _, store = make_service()

            report = service.run()

            taxonomy_records = store.filter(source="node_taxonomy")
            assert len(taxonomy_records) == 4
            types = {r["metadata"]["node_type"] for r in taxonomy_records}
            assert types == {"manual-trigger", "cron-trigger", "http-request", "conditional"}
            assert report.taxonomy_count == 4

        def test_loads_example_workflows_into_store(self):
            service, _, store = make_service()

            report = service.run()

            example_records = store.filter(source="example_workflow")
            assert len(example_records) >= 3
            assert report.examples_count == len(example_records)
            for record in example_records:
                assert "expected_documentation" in record["metadata"]
                assert record["document"]

        def test_generates_embeddings_for_every_document(self):
            service, embedder, store = make_service()

            service.run()

            embedding_dim = embedder.dim
            assert all(len(record["embedding"]) == embedding_dim for record in store.records)
            assert sum(len(call) for call in embedder.calls) == store.count()

        def test_returns_report_with_total_count(self):
            service, _, store = make_service()

            report = service.run()

            assert report.total == store.count()
            assert report.total == report.taxonomy_count + report.examples_count
            assert report.collection == store.collection_name

        def test_taxonomy_documents_include_searchable_text(self):
            service, _, store = make_service()

            service.run()

            http_record = next(
                r for r in store.filter(source="node_taxonomy") if r["metadata"]["node_type"] == "http-request"
            )
            assert "HTTP Request" in http_record["document"]
            assert "configurable http request" in http_record["document"].lower()

        def test_missing_data_dir_raises(self, tmp_path):
            service, _, _ = make_service(data_dir=tmp_path / "nonexistent")

            with pytest.raises(FileNotFoundError):
                service.run()

        def test_empty_examples_dir_loads_only_taxonomy(self, tmp_path):
            (tmp_path / "examples").mkdir()
            taxonomy = tmp_path / "node_taxonomy.json"
            taxonomy.write_text(
                '{"nodes":[{"type":"manual-trigger","name":"Manual Trigger",'
                '"category":"trigger","description":"Manual","params":{},"outputs":["data"]}]}',
                encoding="utf-8",
            )
            service, _, store = make_service(data_dir=tmp_path)

            report = service.run()

            assert report.taxonomy_count == 1
            assert report.examples_count == 0
            assert store.count() == 1
