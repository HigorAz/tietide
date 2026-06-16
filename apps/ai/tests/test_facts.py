"""Unit tests for the Python-side fallback facts extractor."""

from __future__ import annotations

from src.services.facts import extract_facts

DEFINITION = {
    "nodes": [
        {"id": "trigger", "type": "cron-trigger", "name": "Daily 9am", "config": {"cron": "0 9 * * *"}},
        {
            "id": "fetch",
            "type": "http-request",
            "name": "Fetch Orders",
            "alias": "fetch",
            "config": {
                "url": "https://partner.example.com/api/orders",
                "headers": {
                    "authorization": "Bearer {{secrets.PARTNER_TOKEN}}",
                    "x-key": "{{PARTNER_API_KEY}}",
                },
            },
        },
        {
            "id": "gate",
            "type": "conditional",
            "name": "Has Orders?",
            "config": {"condition": "{{steps.fetch.body.count}} > 0"},
        },
        {
            "id": "post",
            "type": "slack-post-message",
            "name": "Notify Slack",
            "config": {"connectionId": "conn-1", "text": "Got {{steps.fetch.body.count}}"},
        },
        {
            "id": "onerr",
            "type": "http-request",
            "name": "Report Error",
            "config": {"url": "https://internal.example.com/alert", "body": "{{trigger.timestamp}}"},
        },
    ],
    "edges": [
        {"id": "e1", "source": "trigger", "target": "fetch"},
        {"id": "e2", "source": "fetch", "target": "gate"},
        {"id": "e3", "source": "gate", "target": "post", "sourceHandle": "true"},
        {"id": "e4", "source": "fetch", "target": "onerr", "sourceHandle": "error", "kind": "error"},
    ],
}


class TestExtractFacts:
    def test_labels_nodes_and_marks_trigger(self):
        facts = extract_facts(DEFINITION)
        labels = {n["id"]: n["label"] for n in facts["nodes"]}
        assert labels["post"] == "Notify Slack"
        assert facts["trigger"]["label"] == "Daily 9am"
        assert facts["trigger"]["config"] == {"cron": "0 9 * * *"}

    def test_orders_from_trigger(self):
        facts = extract_facts(DEFINITION)
        order = facts["executionOrder"]
        assert order[0] == "trigger"
        assert order.index("fetch") < order.index("gate")
        assert set(order) == {"trigger", "fetch", "gate", "post", "onerr"}

    def test_extracts_branches_and_error_edges(self):
        facts = extract_facts(DEFINITION)
        assert facts["branches"][0]["nodeLabel"] == "Has Orders?"
        assert facts["branches"][0]["trueTargets"] == ["Notify Slack"]
        assert facts["errorEdges"] == [
            {"sourceLabel": "Fetch Orders", "targetLabel": "Report Error"}
        ]

    def test_derives_prerequisites(self):
        facts = extract_facts(DEFINITION)
        prereqs = facts["prerequisites"]
        assert prereqs["secrets"] == ["PARTNER_TOKEN"]
        assert prereqs["envVars"] == ["PARTNER_API_KEY"]
        # codeql[py/incomplete-url-substring-sanitization] — false positive: this is a
        # test assertion that an endpoint appears in a list, not host/URL validation.
        assert "partner.example.com" in prereqs["externalEndpoints"]
        # No catalog in Python → connection grouped under the node type.
        assert prereqs["connections"] == [
            {"provider": "slack-post-message", "nodeLabels": ["Notify Slack"]}
        ]

    def test_extracts_data_pills(self):
        facts = extract_facts(DEFINITION)
        by_label = {d["nodeLabel"]: d["reads"] for d in facts["dataPillRefs"]}
        assert by_label["Report Error"] == [{"from": "trigger", "field": "timestamp"}]
        assert by_label["Notify Slack"] == [{"from": "fetch", "field": "body.count"}]

    def test_empty_definition(self):
        facts = extract_facts({"nodes": [], "edges": []})
        assert facts["nodes"] == []
        assert facts["executionOrder"] == []
        assert facts["trigger"] is None
        assert facts["prerequisites"] == {
            "connections": [],
            "secrets": [],
            "envVars": [],
            "externalEndpoints": [],
        }
