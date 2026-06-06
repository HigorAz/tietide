"""Builds the LLM prompt for workflow documentation generation."""

from __future__ import annotations

import json
from typing import Any

SYSTEM_INSTRUCTION = (
    "You are a technical writer documenting integration workflows for the TieTide iPaaS platform. "
    "You read a workflow definition (a JSON graph of nodes and edges, each node carrying its type "
    "and configuration) and produce thorough, accurate documentation that teaches an engineer how "
    "the workflow actually works — not just what it is. Explain the mechanics: trace execution from "
    "the trigger through every node, and for each step describe what it does, the configuration that "
    "matters, the data it consumes, and the data it produces. Ground every statement in the supplied "
    "definition; never invent nodes, fields, or behaviour that is not present."
)

OUTPUT_INSTRUCTION = (
    "Reply with a single JSON object — no prose before or after — with exactly these string keys:\n"
    '  - "objective": 2-4 sentences on what the workflow accomplishes and the problem it solves.\n'
    '  - "walkthrough": the heart of the documentation — an ordered, step-by-step explanation of\n'
    "      the execution, one step per node in the order they run. For each node explain what it\n"
    "      does, the key configuration values that drive it, the data it reads from upstream nodes,\n"
    "      and the data it hands downstream. Reference nodes by their label/type so the reader can\n"
    "      map each step back to the canvas. Use as many sentences as the workflow needs; be\n"
    "      detailed and concrete rather than terse.\n"
    '  - "triggers": how and when the workflow starts, including the trigger configuration.\n'
    '  - "actions": each action node and the role it plays — explain its purpose, not just a list.\n'
    '  - "data_flow": how data is shaped and passed between nodes, including any transformations.\n'
    '  - "decisions": any conditional branches or routing logic and the conditions that select each\n'
    '      path; "None" if there are none.\n'
    "Write in clear prose. Do not add extra keys."
)


class PromptBuilder:
    """Composes the documentation prompt from workflow + retrieved RAG context."""

    def build(
        self,
        *,
        workflow: dict[str, Any],
        context_docs: list[dict[str, Any]],
    ) -> str:
        sections: list[str] = [SYSTEM_INSTRUCTION, ""]

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
