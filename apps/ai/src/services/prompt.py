"""Builds the LLM prompt for workflow documentation generation."""

from __future__ import annotations

import json
from typing import Any

from src.services.sections import SECTION_GUIDANCE, SECTION_KEYS

SYSTEM_INSTRUCTION = (
    "You are a technical writer documenting integration workflows for the TieTide iPaaS platform. "
    "You read a workflow definition (a JSON graph of nodes and edges, each node carrying its type "
    "and configuration) plus a block of authoritative ground-truth facts, and you produce thorough, "
    "accurate documentation that teaches an engineer how the workflow actually works — not merely "
    "what it is. Trace execution from the trigger through every node and explain the mechanics. "
    "Ground every statement in the supplied definition and facts; never invent nodes, fields, "
    "connections, or behaviour."
)

STYLE_INSTRUCTION = (
    "Style guide:\n"
    "- Use active voice and present tense.\n"
    "- Reference sections (prerequisites, trigger, decisions, error_handling) are neutral and "
    "factual — state what is, with no marketing or speculation. Explanation sections (overview, "
    "walkthrough, data_flow) illuminate how and why.\n"
    '- Use second person ("you") only for operator guidance in prerequisites and error_handling.\n'
    "- Refer to every node by its human label (from the facts), never the raw type string.\n"
    "- Never invent nodes, fields, connections, or behaviour. If something is not in the definition "
    'or facts, omit it or write "None".\n'
    "- Define any non-obvious term on first use, and do not repeat the same fact across sections."
)


def _build_output_instruction() -> str:
    lines = [
        "Reply with a single JSON object — no prose before or after — with exactly these string "
        "keys, in this order:",
    ]
    for key in SECTION_KEYS:
        lines.append(f'  - "{key}": {SECTION_GUIDANCE[key]}')
    lines.append("Write in clear prose. Do not add or omit keys.")
    return "\n".join(lines)


OUTPUT_INSTRUCTION = _build_output_instruction()


class PromptBuilder:
    """Composes the documentation prompt from workflow + facts + retrieved RAG context."""

    def build(
        self,
        *,
        workflow: dict[str, Any],
        context_docs: list[dict[str, Any]],
        facts: dict[str, Any] | None = None,
    ) -> str:
        sections: list[str] = [SYSTEM_INSTRUCTION, "", STYLE_INSTRUCTION, ""]

        facts = facts if facts is not None else workflow.get("facts")
        if facts:
            sections.append("## Ground truth (authoritative — do not contradict)")
            sections.append(_render_facts(facts))
            sections.append("")

        sections.append("## Reference materials")
        if context_docs:
            for i, doc in enumerate(context_docs, start=1):
                sections.append(f"### Reference {i}")
                sections.append(doc.get("document", ""))
        else:
            sections.append("No reference materials available — rely on the definition alone.")
        sections.append("")

        name = workflow.get("workflow_name") or workflow.get("name") or "(unnamed)"
        definition = workflow.get("definition", {})
        sections.append("## Workflow")
        sections.append(f"Name: {name}")
        sections.append("Definition:")
        sections.append(json.dumps(definition, ensure_ascii=False))
        sections.append("")

        sections.append("## Output format")
        sections.append(OUTPUT_INSTRUCTION)

        return "\n".join(sections)


def _render_facts(facts: dict[str, Any]) -> str:
    """Render the computed facts as a compact, authoritative reference block."""
    nodes = facts.get("nodes") or []
    label_by_id = {n.get("id"): n.get("label") for n in nodes}
    lines: list[str] = []

    trigger = facts.get("trigger")
    if trigger:
        lines.append(f"Trigger: {trigger.get('label')} (type: {trigger.get('type')})")
        config = trigger.get("config")
        if config:
            lines.append(f"  config: {json.dumps(config, ensure_ascii=False)}")

    order = facts.get("executionOrder") or []
    if order:
        ordered = " -> ".join(label_by_id.get(nid, nid) for nid in order)
        lines.append(f"Execution order: {ordered}")

    if nodes:
        lines.append("Nodes:")
        for n in nodes:
            provider = f", provider: {n.get('provider')}" if n.get("provider") else ""
            skipped = " [skipped]" if n.get("skipped") else ""
            lines.append(
                f"  - {n.get('label')} (type: {n.get('type')}, category: {n.get('category')}"
                f"{provider}){skipped}"
            )

    prereqs = facts.get("prerequisites") or {}
    connections = prereqs.get("connections") or []
    if connections:
        joined = ", ".join(
            f"{c.get('provider')} (used by: {', '.join(c.get('nodeLabels') or [])})"
            for c in connections
        )
        lines.append(f"Required connections: {joined}")
    if prereqs.get("secrets"):
        lines.append(f"Required secrets: {', '.join(prereqs['secrets'])}")
    if prereqs.get("envVars"):
        lines.append(f"Required env vars: {', '.join(prereqs['envVars'])}")
    if prereqs.get("externalEndpoints"):
        lines.append(f"External endpoints: {', '.join(prereqs['externalEndpoints'])}")

    branches = facts.get("branches") or []
    for b in branches:
        true_t = ", ".join(b.get("trueTargets") or []) or "—"
        false_t = ", ".join(b.get("falseTargets") or []) or "—"
        cond = b.get("condition") or "(unspecified)"
        lines.append(
            f"Branch at {b.get('nodeLabel')}: when [{cond}] -> true: {true_t}; false: {false_t}"
        )

    error_edges = facts.get("errorEdges") or []
    for e in error_edges:
        lines.append(f"Error path: {e.get('sourceLabel')} -> {e.get('targetLabel')}")

    data_pills = facts.get("dataPillRefs") or []
    for d in data_pills:
        reads = ", ".join(f"{r.get('from')}.{r.get('field')}" for r in d.get("reads") or [])
        if reads:
            lines.append(f"{d.get('nodeLabel')} reads: {reads}")

    return "\n".join(lines) if lines else "No facts available."
