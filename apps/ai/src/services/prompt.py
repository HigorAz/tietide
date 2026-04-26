"""Builds the LLM prompt for workflow documentation generation."""

from __future__ import annotations

import json
from typing import Any


SYSTEM_INSTRUCTION = (
    "You are a technical writer documenting integration workflows for the TieTide iPaaS platform. "
    "Your job is to read a workflow definition (a JSON graph of nodes and edges) and produce "
    "concise, accurate documentation aimed at engineers who will operate the workflow."
)

OUTPUT_INSTRUCTION = (
    "Reply with a single JSON object — no prose before or after — with exactly these string keys:\n"
    '  - "objective": one or two sentences describing what the workflow accomplishes.\n'
    '  - "triggers": how and when the workflow starts.\n'
    '  - "actions": the sequence of actions performed, in order.\n'
    '  - "data_flow": how data moves between nodes.\n'
    '  - "decisions": any conditional branches or routing logic; "None" if none.\n'
    "Keep each value under 4 sentences. Do not add extra keys."
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
