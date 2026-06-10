// Pure helpers for the structured ErrorCard: detecting the failing template
// path inside a worker error message (so it can be highlighted as a React
// <mark> built from React nodes, never raw HTML) and deriving a plain-language hint
// from known error wordings. No React, no `any` — fully unit-testable.

export interface TemplatePathSpan {
  /** Offset of the first matched character in the message. */
  start: number;
  /** Offset just past the last matched character. */
  end: number;
  /** The matched substring (a full `{{token}}` or a bare `steps.*`/`trigger.*` path). */
  text: string;
}

// Matches either a full `{{ … }}` token or a bare path rooted at `steps`/`trigger`
// followed by one or more `.segment` / `[index]` parts. Used to locate the
// offending reference inside messages like `Template path not found: steps.code.count`.
const PATH_RE = /\{\{[^{}]+\}\}|(?:steps|trigger)(?:\.[A-Za-z0-9_$]+|\[\d+\])+/g;

/**
 * Find every template path or `{{token}}` reference in an error message and
 * return their character spans, non-overlapping and sorted by start. Returns
 * an empty array when the message contains no reference.
 */
export function findTemplatePaths(message: string): TemplatePathSpan[] {
  const spans: TemplatePathSpan[] = [];
  PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_RE.exec(message)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return spans;
}

interface HintRule {
  pattern: RegExp;
  hint: string;
}

// Evaluated top-down, first match wins. Adding a future hint is a one-line entry.
// Patterns are matched against the raw worker error message; the wordings mirror
// the real template-engine errors (packages/shared template-engine/errors.ts).
const HINT_RULES: HintRule[] = [
  {
    pattern: /template path not found/i,
    hint: "The upstream node didn't expose that field — check the path, or re-run the upstream node so its output is captured.",
  },
  {
    pattern: /environment variable .* not found|env var .* not found|EnvVarNotFound/i,
    hint: "That environment variable isn't defined — add it under Settings → Environment variables.",
  },
  {
    pattern: /timed? ?out|timeout/i,
    hint: "The service didn't answer in time — try again, or check the service's status.",
  },
  {
    pattern: /unauthorized|401|invalid[ _-]?(credential|token|api[ _-]?key)/i,
    hint: "The connection's credentials look invalid — reconnect it on the Connections page.",
  },
];

/**
 * Derive a plain-language hint from a known error wording, or null when the
 * message doesn't match any rule (never fabricate a hint).
 */
export function deriveHint(message: string): string | null {
  for (const rule of HINT_RULES) {
    if (rule.pattern.test(message)) return rule.hint;
  }
  return null;
}
