// Pure token helpers shared by the inline `{{` autocomplete (DataPillInput) and
// the standalone DataPillPicker panel. Extracted from DataPillInput so both
// surfaces parse/insert tokens identically and the component stays under the
// 300-line budget.

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const RESERVED_RE = /^[A-Z][A-Z0-9_]*$/;

export interface Segment {
  kind: 'literal' | 'token' | 'reserved';
  text: string;
}

export interface InsertResult {
  value: string;
  caret: number;
}

/** Split a field value into literal / token / reserved segments for highlighting. */
export function splitSegments(value: string): Segment[] {
  const segs: Segment[] = [];
  let lastIdx = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(value)) !== null) {
    if (m.index > lastIdx) {
      segs.push({ kind: 'literal', text: value.slice(lastIdx, m.index) });
    }
    const inner = (m[1] ?? '').trim();
    segs.push({ kind: RESERVED_RE.test(inner) ? 'reserved' : 'token', text: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < value.length) segs.push({ kind: 'literal', text: value.slice(lastIdx) });
  return segs;
}

/**
 * If the caret sits inside an unclosed `{{ … ` token, return the index of that
 * `{{`; otherwise null. Used to drive the inline autocomplete and to decide
 * whether an insert replaces a partial token or inserts a fresh one.
 */
export function findOpenTokenStart(text: string, caret: number): number | null {
  const before = text.slice(0, caret);
  const lastOpen = before.lastIndexOf('{{');
  if (lastOpen < 0) return null;
  const lastClose = before.lastIndexOf('}}');
  if (lastClose > lastOpen) return null;
  return lastOpen;
}

/**
 * Build the `{{nodeId.path}}` token for a suggestion. An empty path yields the
 * whole-output pill `{{nodeId}}` (the trailing `.` is stripped).
 */
export function buildPillToken(nodeId: string, path: string): string {
  return `{{${nodeId}.${path}}}`.replace(/\.\s*\}\}$/, '}}');
}

/**
 * Insert `token` into `value` at `caret`. If the caret is inside an open `{{`
 * token, the partial token (from `{{` to the caret) is replaced; otherwise the
 * token is inserted at the caret. Returns the new value and caret position.
 */
export function insertToken(value: string, token: string, caret: number): InsertResult {
  const c = Math.min(Math.max(caret, 0), value.length);
  const tokenStart = findOpenTokenStart(value, c);
  if (tokenStart !== null) {
    return {
      value: value.slice(0, tokenStart) + token + value.slice(c),
      caret: tokenStart + token.length,
    };
  }
  return {
    value: value.slice(0, c) + token + value.slice(c),
    caret: c + token.length,
  };
}

export interface ClosedTokenSpan {
  /** Index of the opening `{{`. */
  start: number;
  /** Index just past the closing `}}` (equals the caret). */
  end: number;
  /** Trimmed inner expression, e.g. `http_1.body.name`. */
  inner: string;
}

/**
 * When the caret sits immediately after a complete `{{ … }}` token, return that token's
 * span; otherwise null. Drives the #258 "append operator" menu availability.
 */
export function findClosedTokenBeforeCaret(value: string, caret: number): ClosedTokenSpan | null {
  const before = value.slice(0, Math.min(Math.max(caret, 0), value.length));
  if (!before.endsWith('}}')) return null;
  const start = before.lastIndexOf('{{');
  if (start === -1) return null;
  const inner = before.slice(start + 2, before.length - 2);
  if (inner.includes('{{') || inner.includes('}}')) return null;
  if (inner.trim().length === 0) return null;
  return { start, end: before.length, inner: inner.trim() };
}

/**
 * Append a template operator to the closed token immediately before the caret. The token is
 * rebuilt from its trimmed inner expression. For arg-taking operators (`join`, `default`) it
 * inserts empty quotes and parks the caret between them. No-op when the caret is not right
 * after a closed token.
 */
export function appendOperatorAtCaret(
  value: string,
  caret: number,
  op: { name: string; hasArg: boolean },
): InsertResult {
  const span = findClosedTokenBeforeCaret(value, caret);
  if (!span) return { value, caret };

  const opText = op.hasArg ? `.${op.name}("")` : `.${op.name}`;
  const newInner = `${span.inner}${opText}`;
  const before = value.slice(0, span.start);
  const after = value.slice(span.end);
  const nextValue = `${before}{{${newInner}}}${after}`;

  // Caret: between the inserted quotes for arg operators, else right after the operator name.
  const innerCaret = op.hasArg ? newInner.length - 2 : newInner.length;
  return { value: nextValue, caret: before.length + 2 + innerCaret };
}
