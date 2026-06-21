"""Fallback ground-truth facts extraction (Python side).

The NestJS API normally computes richer facts (with node catalog labels,
categories, and providers) and passes them in the request. This module is the
fallback used when no facts are supplied — e.g. demo-cache priming at startup,
or any direct call to the AI service. It mirrors the structure of the API's
WorkflowFacts so the prompt renderer treats both identically, but without the
node catalog it falls back to node names/types for labels and providers.
"""

from __future__ import annotations

import re
from collections import deque
from typing import Any
from urllib.parse import urlparse

_SECRET_RE = re.compile(r"\{\{\s*secrets\.([A-Za-z0-9_]+)")
_ENV_RE = re.compile(r"\{\{\s*([A-Z][A-Z0-9_]+)\s*\}\}")
_TRIGGER_PILL_RE = re.compile(r"\{\{\s*trigger\.([\w.]+?)\s*\}\}")
_STEPS_PILL_RE = re.compile(r"\{\{\s*steps\.(\w+)\.([\w.]+?)\s*\}\}")


def _collect_strings(value: Any, out: list[str]) -> None:
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, list):
        for item in value:
            _collect_strings(item, out)
    elif isinstance(value, dict):
        for item in value.values():
            _collect_strings(item, out)


def _topological_order(nodes: list[dict], edges: list[dict]) -> list[str]:
    ids = [str(n.get("id")) for n in nodes]
    indegree = {nid: 0 for nid in ids}
    adjacency: dict[str, list[str]] = {nid: [] for nid in ids}
    for edge in edges:
        source = str(edge.get("source"))
        target = str(edge.get("target"))
        if target not in indegree or source not in adjacency:
            continue
        indegree[target] += 1
        adjacency[source].append(target)

    queue = deque(nid for nid in ids if indegree[nid] == 0)
    order: list[str] = []
    seen: set[str] = set()
    while queue:
        nid = queue.popleft()
        if nid in seen:
            continue
        seen.add(nid)
        order.append(nid)
        for nxt in adjacency[nid]:
            indegree[nxt] -= 1
            if indegree[nxt] <= 0 and nxt not in seen:
                queue.append(nxt)
    order.extend(nid for nid in ids if nid not in seen)
    return order


def extract_facts(definition: dict[str, Any]) -> dict[str, Any]:
    nodes = definition.get("nodes") or []
    edges = definition.get("edges") or []

    def label_of(node_id: str) -> str:
        for n in nodes:
            if str(n.get("id")) == node_id:
                return str(n.get("name") or n.get("type") or node_id)
        return node_id

    fact_nodes: list[dict[str, Any]] = []
    for n in nodes:
        node: dict[str, Any] = {
            "id": str(n.get("id")),
            "label": str(n.get("name") or n.get("type") or n.get("id")),
            "type": str(n.get("type") or ""),
            "category": "unknown",
        }
        if n.get("alias"):
            node["alias"] = n["alias"]
        if n.get("skipped"):
            node["skipped"] = True
        if n.get("description"):
            node["description"] = n["description"]
        fact_nodes.append(node)

    # Trigger: a node whose type contains "trigger", else an in-degree-0 node.
    targets = {str(e.get("target")) for e in edges}
    trigger_node = next(
        (n for n in nodes if "trigger" in str(n.get("type", ""))),
        next((n for n in nodes if str(n.get("id")) not in targets), nodes[0] if nodes else None),
    )
    trigger = (
        {
            "id": str(trigger_node.get("id")),
            "label": str(trigger_node.get("name") or trigger_node.get("type")),
            "type": str(trigger_node.get("type") or ""),
            "config": trigger_node.get("config") or {},
        }
        if trigger_node
        else None
    )

    branches: list[dict[str, Any]] = []
    for n in nodes:
        if n.get("type") != "conditional":
            continue
        outgoing = [e for e in edges if str(e.get("source")) == str(n.get("id"))]
        condition = (n.get("config") or {}).get("condition")
        branch: dict[str, Any] = {
            "nodeLabel": label_of(str(n.get("id"))),
            "trueTargets": [
                label_of(str(e.get("target"))) for e in outgoing if e.get("sourceHandle") == "true"
            ],
            "falseTargets": [
                label_of(str(e.get("target"))) for e in outgoing if e.get("sourceHandle") == "false"
            ],
        }
        if isinstance(condition, str):
            branch["condition"] = condition
        branches.append(branch)

    error_edges = [
        {"sourceLabel": label_of(str(e.get("source"))), "targetLabel": label_of(str(e.get("target")))}
        for e in edges
        if e.get("sourceHandle") == "error" or e.get("kind") == "error"
    ]

    connections_by_provider: dict[str, list[str]] = {}
    secrets: set[str] = set()
    env_vars: set[str] = set()
    endpoints: set[str] = set()
    data_pill_refs: list[dict[str, Any]] = []

    for n in nodes:
        config = n.get("config") or {}
        connection_id = config.get("connectionId")
        if isinstance(connection_id, str) and connection_id.strip():
            provider = str(n.get("type") or "unknown")
            connections_by_provider.setdefault(provider, []).append(label_of(str(n.get("id"))))

        strings: list[str] = []
        _collect_strings(config, strings)
        reads: list[dict[str, str]] = []
        seen_reads: set[str] = set()
        for raw in strings:
            for m in _SECRET_RE.finditer(raw):
                secrets.add(m.group(1))
            for m in _ENV_RE.finditer(raw):
                env_vars.add(m.group(1))
            stripped = raw.strip()
            if stripped.startswith("http://") or stripped.startswith("https://"):
                host = urlparse(stripped).netloc
                if host:
                    endpoints.add(host)
            for m in _TRIGGER_PILL_RE.finditer(raw):
                key = f"trigger:{m.group(1)}"
                if key not in seen_reads:
                    seen_reads.add(key)
                    reads.append({"from": "trigger", "field": m.group(1)})
            for m in _STEPS_PILL_RE.finditer(raw):
                key = f"{m.group(1)}:{m.group(2)}"
                if key not in seen_reads:
                    seen_reads.add(key)
                    reads.append({"from": m.group(1), "field": m.group(2)})
        if reads:
            data_pill_refs.append({"nodeLabel": label_of(str(n.get("id"))), "reads": reads})

    prerequisites = {
        "connections": [
            {"provider": provider, "nodeLabels": labels}
            for provider, labels in sorted(connections_by_provider.items())
        ],
        "secrets": sorted(secrets),
        "envVars": sorted(env_vars),
        "externalEndpoints": sorted(endpoints),
    }

    return {
        "nodes": fact_nodes,
        "executionOrder": _topological_order(nodes, edges),
        "trigger": trigger,
        "branches": branches,
        "errorEdges": error_edges,
        "prerequisites": prerequisites,
        "dataPillRefs": data_pill_refs,
    }
