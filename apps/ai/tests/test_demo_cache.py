"""Unit tests for the demo documentation cache."""

from __future__ import annotations

from src.services.demo_cache import DemoDocumentationCache
from src.services.documentation import DocumentationSections, GeneratedDocumentation


def _make_doc(workflow_id: str = "wf1", workflow_name: str = "W") -> GeneratedDocumentation:
    return GeneratedDocumentation(
        workflow_id=workflow_id,
        workflow_name=workflow_name,
        sections=DocumentationSections(
            objective="o",
            triggers="t",
            actions="a",
            data_flow="d",
            decisions="x",
        ),
        documentation="# md",
    )


class TestDemoDocumentationCache:
    def test_get_returns_none_when_empty(self):
        cache = DemoDocumentationCache()

        assert cache.get({"workflow_id": "wf1", "definition": {}}) is None

    def test_returns_registered_doc_for_matching_payload(self):
        cache = DemoDocumentationCache()
        wf = {
            "workflow_id": "wf1",
            "workflow_name": "W",
            "definition": {"nodes": [{"id": "a", "type": "manual-trigger"}]},
        }
        doc = _make_doc()
        cache.register(wf, doc)

        assert cache.get(wf) is doc

    def test_returns_none_when_definition_changes(self):
        cache = DemoDocumentationCache()
        wf = {
            "workflow_id": "wf1",
            "workflow_name": "W",
            "definition": {"nodes": [{"id": "a", "type": "manual-trigger"}]},
        }
        cache.register(wf, _make_doc())
        modified = {
            **wf,
            "definition": {"nodes": [{"id": "a", "type": "http-request"}]},
        }

        assert cache.get(modified) is None

    def test_size_reflects_registrations(self):
        cache = DemoDocumentationCache()
        cache.register(
            {"workflow_id": "1", "workflow_name": "A", "definition": {}},
            _make_doc("1"),
        )
        cache.register(
            {"workflow_id": "2", "workflow_name": "B", "definition": {}},
            _make_doc("2"),
        )

        assert cache.size() == 2

    def test_clear_resets_cache(self):
        cache = DemoDocumentationCache()
        cache.register(
            {"workflow_id": "1", "workflow_name": "A", "definition": {}},
            _make_doc("1"),
        )

        cache.clear()

        assert cache.size() == 0

    def test_key_is_dict_order_independent(self):
        cache = DemoDocumentationCache()
        wf_a = {
            "workflow_id": "wf1",
            "workflow_name": "W",
            "definition": {"a": 1, "b": 2},
        }
        wf_b = {
            "workflow_id": "wf1",
            "workflow_name": "W",
            "definition": {"b": 2, "a": 1},
        }
        cache.register(wf_a, _make_doc())

        assert cache.get(wf_b) is not None
