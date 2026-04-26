"""Unit tests for the prompt builder used by the documentation service."""

from __future__ import annotations

import json

from src.services.prompt import PromptBuilder


WORKFLOW = {
    "name": "Daily Sync",
    "definition": {
        "nodes": [
            {"id": "trigger", "type": "cron-trigger", "params": {"cron": "0 9 * * *"}},
            {"id": "fetch", "type": "http-request", "params": {"url": "https://x"}},
        ],
        "edges": [{"from": "trigger", "to": "fetch"}],
    },
}

CONTEXT_DOCS = [
    {
        "id": "node:cron-trigger",
        "document": "Node: Cron Trigger — fires on schedule.",
        "metadata": {"source": "node_taxonomy", "node_type": "cron-trigger"},
    },
    {
        "id": "example:cron_sync",
        "document": "Workflow: Daily API Data Sync\nFetches partner orders.",
        "metadata": {"source": "example_workflow"},
    },
]


class TestPromptBuilder:
    class TestBuild:
        def test_includes_system_instruction(self):
            builder = PromptBuilder()

            prompt = builder.build(workflow=WORKFLOW, context_docs=CONTEXT_DOCS)

            assert "technical writer" in prompt.lower()
            assert "tietide" in prompt.lower()

        def test_requests_required_sections_as_json(self):
            builder = PromptBuilder()

            prompt = builder.build(workflow=WORKFLOW, context_docs=CONTEXT_DOCS)

            for key in ("objective", "triggers", "actions", "data_flow", "decisions"):
                assert key in prompt
            assert "json" in prompt.lower()

        def test_includes_workflow_definition(self):
            builder = PromptBuilder()

            prompt = builder.build(workflow=WORKFLOW, context_docs=CONTEXT_DOCS)

            assert "Daily Sync" in prompt
            assert "cron-trigger" in prompt
            assert "0 9 * * *" in prompt

        def test_embeds_context_documents(self):
            builder = PromptBuilder()

            prompt = builder.build(workflow=WORKFLOW, context_docs=CONTEXT_DOCS)

            assert "Cron Trigger" in prompt
            assert "Daily API Data Sync" in prompt

        def test_with_empty_context_marks_no_examples(self):
            builder = PromptBuilder()

            prompt = builder.build(workflow=WORKFLOW, context_docs=[])

            assert "Daily Sync" in prompt
            assert "no reference" in prompt.lower() or "no similar" in prompt.lower()

        def test_workflow_definition_is_valid_json_in_prompt(self):
            builder = PromptBuilder()

            prompt = builder.build(workflow=WORKFLOW, context_docs=[])

            serialized = json.dumps(WORKFLOW["definition"], ensure_ascii=False)
            assert serialized in prompt

        def test_with_context_is_longer_than_without(self):
            builder = PromptBuilder()

            with_ctx = builder.build(workflow=WORKFLOW, context_docs=CONTEXT_DOCS)
            without_ctx = builder.build(workflow=WORKFLOW, context_docs=[])

            assert len(with_ctx) > len(without_ctx)
