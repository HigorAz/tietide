"""Single source of truth for the documentation section model.

The documentation is a Diátaxis / runbook hybrid: a blend of *reference*
(neutral facts — prerequisites, trigger, decisions, error handling) and
*explanation* (how/why — overview, walkthrough, data flow). Both the prompt
(what we ask the model for) and the parser/renderer (what we accept and how we
format it) derive from these tables, so the model is changed in one place.
"""

from __future__ import annotations

from typing import Any

# Order = reading order in the rendered markdown.
SECTION_KEYS: tuple[str, ...] = (
    "overview",
    "prerequisites",
    "trigger",
    "walkthrough",
    "data_flow",
    "decisions",
    "error_handling",
)

SECTION_TITLES: dict[str, str] = {
    "overview": "Overview",
    "prerequisites": "Prerequisites",
    "trigger": "Trigger",
    "walkthrough": "Walkthrough",
    "data_flow": "Data Flow",
    "decisions": "Decisions",
    "error_handling": "Error Handling",
}

# Per-section instructions handed to the model. Each line states what the section
# must contain and which Diátaxis mode it is (reference = neutral facts,
# explanation = how/why).
SECTION_GUIDANCE: dict[str, str] = {
    "overview": (
        "Explanation. 2-4 sentences on what the workflow accomplishes and the "
        "real-world problem it solves. Focus on outcome and intent, not mechanics."
    ),
    "prerequisites": (
        "Reference. What must be in place to run it: the connections (by provider), "
        "secrets, and environment variables it needs, plus any external endpoints it "
        'calls. List them plainly using the ground-truth facts; write "None" if there '
        "are none. Do not invent credentials that are not referenced."
    ),
    "trigger": (
        "Reference. How and when the workflow starts, including the trigger's "
        "configuration (e.g. cron schedule, webhook path)."
    ),
    "walkthrough": (
        "Explanation and the heart of the document. An ordered, step-by-step account "
        "of execution — one step per node in execution order. For each node explain "
        "what it does, the key configuration that drives it, the data it reads from "
        "upstream nodes, and the data it produces. Refer to nodes by their label. Be "
        "concrete and thorough."
    ),
    "data_flow": (
        "Explanation. How data is shaped and passed between nodes — which fields move "
        "where, and any transformations (data-pill references like "
        "{{steps.<alias>.field}})."
    ),
    "decisions": (
        "Reference/explanation. Each conditional branch and the condition that selects "
        'each path. Write "None" if there are no branches.'
    ),
    "error_handling": (
        "Reference. How failures are handled: error edges/paths, retries, and what "
        'happens when a node fails. Write "None" if there is no explicit error handling.'
    ),
}


def build_json_schema() -> dict[str, Any]:
    """JSON Schema for Ollama structured outputs — all sections required strings."""
    return {
        "type": "object",
        "properties": {key: {"type": "string"} for key in SECTION_KEYS},
        "required": list(SECTION_KEYS),
        "additionalProperties": False,
    }
