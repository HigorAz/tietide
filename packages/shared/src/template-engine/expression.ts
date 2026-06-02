import { TemplatePathNotFoundError } from './errors.js';

/**
 * Chained-method expression engine for `{{ }}` data pills (#258).
 *
 * Grammar: `path operator*`, evaluated left-to-right over a scope object.
 *   - `.identifier`        → operator if `identifier` ∈ allowlist, otherwise key access
 *   - `.identifier(arg)`   → operator with one literal argument (`default(x)`, `join(sep)`)
 *   - `[n]` (number)       → index access, equivalent to `.n` (path-style)
 *   - `['key']`/`["key"]`  → literal key access (escape hatch for keys named like an operator)
 *
 * Key/index access keep the original engine semantics: the `__proto__/constructor/prototype`
 * ban, an `Object.prototype.hasOwnProperty` check, and a thrown `TemplatePathNotFoundError`
 * (carrying the full expression as `.path`) on a miss. Operators select a hardcoded `switch`
 * branch — they never reach into the data object's prototype — and return the `undefined`
 * sentinel on a type mismatch instead of throwing.
 *
 * A bare `.first` is ALWAYS the operator; read a data key literally named `first` via the
 * `['first']` bracket escape.
 */

export const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/** Returned by an operator when it is applied to the wrong type. Never thrown. */
export const OPERATOR_SENTINEL = undefined;

export interface TemplateOperator {
  /** The method name as written in a token, e.g. `first`, `present?`, `join`. */
  name: string;
  /** Human label for the picker UI. */
  label: string;
  /** True for operators that take a literal argument (`default`, `join`). */
  hasArg: boolean;
  /** Hint shown for the argument in the UI (e.g. `separator`, `fallback`). */
  argHint?: string;
}

/**
 * Single source of truth for the operator allowlist — consumed by the evaluator's `switch`
 * AND the SPA "append operator" menu, so the two can never drift apart.
 */
export const TEMPLATE_OPERATORS: readonly TemplateOperator[] = [
  { name: 'first', label: 'first', hasArg: false },
  { name: 'last', label: 'last', hasArg: false },
  { name: 'size', label: 'size', hasArg: false },
  { name: 'length', label: 'length', hasArg: false },
  { name: 'present?', label: 'present?', hasArg: false },
  { name: 'blank?', label: 'blank?', hasArg: false },
  { name: 'to_s', label: 'to_s (string)', hasArg: false },
  { name: 'to_i', label: 'to_i (integer)', hasArg: false },
  { name: 'to_n', label: 'to_n (number)', hasArg: false },
  { name: 'upcase', label: 'upcase', hasArg: false },
  { name: 'downcase', label: 'downcase', hasArg: false },
  { name: 'strip', label: 'strip', hasArg: false },
  { name: 'trim', label: 'trim', hasArg: false },
  { name: 'default', label: 'default(…)', hasArg: true, argHint: 'fallback' },
  { name: 'keys', label: 'keys', hasArg: false },
  { name: 'values', label: 'values', hasArg: false },
  { name: 'join', label: 'join(…)', hasArg: true, argHint: 'separator' },
] as const;

const OPERATOR_NAMES = new Set(TEMPLATE_OPERATORS.map((o) => o.name));

type LiteralArg = string | number | boolean | null;

type Segment =
  | { kind: 'key'; name: string } // root key, `.name` (non-operator), or `['name']`
  | { kind: 'index'; index: number } // `[n]`
  | { kind: 'dotName'; name: string } // `.name` (operator if allowlisted, else key)
  | { kind: 'dotCall'; name: string; arg: LiteralArg | undefined }; // `.name(arg)`

const IDENT_CHAR = /[A-Za-z0-9_]/;

/** Convert any value to its display string — shared by interpolation and the `to_s` operator. */
export function stringifyValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'boolean') return value === false;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return false;
  if (isObjectLike(value)) return Object.keys(value).length === 0;
  return false;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const n = Number(trimmed);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function readIdentifier(expr: string, start: number): { value: string; next: number } {
  let i = start;
  while (i < expr.length && IDENT_CHAR.test(expr[i] as string)) i++;
  // Allow a single trailing `?` for predicate operators (present?, blank?).
  if (i < expr.length && expr[i] === '?') i++;
  return { value: expr.slice(start, i), next: i };
}

function parseLiteralArg(raw: string): LiteralArg | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const first = trimmed[0];
  if (first === '"' || first === "'") {
    // Quoted string: strip the surrounding quotes (quotes are required to match).
    if (trimmed.length >= 2 && trimmed[trimmed.length - 1] === first) {
      return trimmed.slice(1, -1);
    }
    return trimmed.slice(1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  const n = Number(trimmed);
  if (!Number.isNaN(n)) return n;
  return trimmed; // bare word → treat as a string literal
}

/** Read a `(...)` argument list. Respects quotes so separators with `)`/`,` survive. */
function readArgs(
  expr: string,
  open: number,
  fullExpr: string,
): { arg: LiteralArg | undefined; next: number } {
  let i = open + 1;
  let depth = 1;
  let quote: string | null = null;
  const startInner = i;
  while (i < expr.length) {
    const ch = expr[i] as string;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        const inner = expr.slice(startInner, i);
        return { arg: parseLiteralArg(inner), next: i + 1 };
      }
    }
    i++;
  }
  throw new TemplatePathNotFoundError(fullExpr); // unterminated argument list
}

/** Read a `[...]` segment → numeric index or quoted literal key. */
function readBracket(expr: string, open: number, fullExpr: string): { seg: Segment; next: number } {
  const close = expr.indexOf(']', open + 1);
  if (close === -1) throw new TemplatePathNotFoundError(fullExpr);
  const inner = expr.slice(open + 1, close).trim();
  if (inner.length === 0) throw new TemplatePathNotFoundError(fullExpr);
  const first = inner[0];
  if (first === '"' || first === "'") {
    if (inner.length < 2 || inner[inner.length - 1] !== first) {
      throw new TemplatePathNotFoundError(fullExpr);
    }
    return { seg: { kind: 'key', name: inner.slice(1, -1) }, next: close + 1 };
  }
  const index = Number(inner);
  if (!Number.isInteger(index) || index < 0) throw new TemplatePathNotFoundError(fullExpr);
  return { seg: { kind: 'index', index }, next: close + 1 };
}

function tokenize(expr: string): Segment[] {
  const segments: Segment[] = [];
  const root = readIdentifier(expr, 0);
  if (root.value.length === 0) throw new TemplatePathNotFoundError(expr);
  segments.push({ kind: 'key', name: root.value });

  let i = root.next;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '.') {
      const id = readIdentifier(expr, i + 1);
      if (id.value.length === 0) throw new TemplatePathNotFoundError(expr);
      i = id.next;
      if (expr[i] === '(') {
        const { arg, next } = readArgs(expr, i, expr);
        segments.push({ kind: 'dotCall', name: id.value, arg });
        i = next;
      } else {
        segments.push({ kind: 'dotName', name: id.value });
      }
    } else if (ch === '[') {
      const { seg, next } = readBracket(expr, i, expr);
      segments.push(seg);
      i = next;
    } else {
      throw new TemplatePathNotFoundError(expr); // unexpected character
    }
  }
  return segments;
}

function hasOwnNonForbidden(current: unknown, key: string): boolean {
  if (FORBIDDEN_SEGMENTS.has(key)) return false;
  if (current === null || current === undefined || typeof current !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(current as Record<string, unknown>, key);
}

function keyAccess(current: unknown, key: string, fullExpr: string): unknown {
  if (FORBIDDEN_SEGMENTS.has(key)) throw new TemplatePathNotFoundError(fullExpr);
  if (current === null || current === undefined || typeof current !== 'object') {
    throw new TemplatePathNotFoundError(fullExpr);
  }
  const obj = current as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new TemplatePathNotFoundError(fullExpr);
  }
  return obj[key];
}

function applyOperator(name: string, arg: LiteralArg | undefined, value: unknown): unknown {
  switch (name) {
    case 'first':
      return Array.isArray(value) ? value[0] : OPERATOR_SENTINEL;
    case 'last':
      return Array.isArray(value) ? value[value.length - 1] : OPERATOR_SENTINEL;
    case 'size':
    case 'length':
      if (Array.isArray(value) || typeof value === 'string') return value.length;
      if (isObjectLike(value)) return Object.keys(value).length;
      return OPERATOR_SENTINEL;
    case 'present?':
      return !isBlank(value);
    case 'blank?':
      return isBlank(value);
    case 'to_s':
      return stringifyValue(value);
    case 'to_i': {
      const n = toNumber(value);
      return n === undefined ? OPERATOR_SENTINEL : Math.trunc(n);
    }
    case 'to_n':
      return toNumber(value) ?? OPERATOR_SENTINEL;
    case 'upcase':
      return typeof value === 'string' ? value.toUpperCase() : OPERATOR_SENTINEL;
    case 'downcase':
      return typeof value === 'string' ? value.toLowerCase() : OPERATOR_SENTINEL;
    case 'strip':
    case 'trim':
      return typeof value === 'string' ? value.trim() : OPERATOR_SENTINEL;
    case 'default':
      return value === null || value === undefined ? arg : value;
    case 'keys':
      return isObjectLike(value) ? Object.keys(value) : OPERATOR_SENTINEL;
    case 'values':
      return isObjectLike(value) ? Object.values(value) : OPERATOR_SENTINEL;
    case 'join': {
      if (!Array.isArray(value)) return OPERATOR_SENTINEL;
      const sep = typeof arg === 'string' ? arg : arg === undefined ? '' : stringifyValue(arg);
      return value.map((el) => stringifyValue(el)).join(sep);
    }
    default:
      return OPERATOR_SENTINEL;
  }
}

/**
 * Resolve a single token expression against `scope`. Replaces the old dot-walk `lookup()`
 * and is a strict superset of it — plain `{{ nodeId.path }}` tokens resolve identically.
 */
export function evaluateExpression(scope: Record<string, unknown>, expr: string): unknown {
  if (expr.length === 0) throw new TemplatePathNotFoundError(expr);
  const segments = tokenize(expr);
  let current: unknown = scope;
  for (const seg of segments) {
    if (seg.kind === 'key') {
      current = keyAccess(current, seg.name, expr);
    } else if (seg.kind === 'index') {
      current = keyAccess(current, String(seg.index), expr);
    } else if (seg.kind === 'dotName') {
      // Key access takes precedence: `.first` resolves a real `first` property when one
      // exists (strict superset of the old dot-walk), and only falls back to the operator
      // when the value has no such own property (e.g. an array's `.first`, a number's `.size`).
      current =
        OPERATOR_NAMES.has(seg.name) && !hasOwnNonForbidden(current, seg.name)
          ? applyOperator(seg.name, undefined, current)
          : keyAccess(current, seg.name, expr);
    } else {
      // dotCall — only allowlisted operators may take arguments.
      if (!OPERATOR_NAMES.has(seg.name)) throw new TemplatePathNotFoundError(expr);
      current = applyOperator(seg.name, seg.arg, current);
    }
  }
  return current;
}
