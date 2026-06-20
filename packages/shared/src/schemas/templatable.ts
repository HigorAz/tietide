import { z } from 'zod';

/** Matches a string containing a `{{ … }}` data-pill / template token. */
export const TEMPLATE_VALUE_RE = /\{\{[\s\S]*?\}\}/;

/**
 * Coerce an already-resolved, non-template string to a number when it parses
 * cleanly; otherwise return it unchanged so validation reports a real error
 * (an empty or non-numeric string must NOT silently become 0/NaN). Use as the
 * `coerce` argument to {@link templatable} for numeric fields.
 */
export function coerceNumeric(value: string): unknown {
  if (value.trim() === '') return value;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

/**
 * Wrap a config field schema so it ALSO accepts a `{{pill}}` template string —
 * the basis of the editor's per-field "fx" (literal ⇄ expression) toggle.
 *
 * A field in expression mode stores a template string; the engine resolves it
 * at runtime. A *sole* `{{token}}` resolves to its real typed value (see the
 * template engine's sole-token passthrough), so it satisfies `inner` directly
 * and needs no coercion. The optional `coerce` covers the interpolated case: a
 * plain (already-resolved) string that is NOT itself a template is coerced
 * before validation (e.g. a resolved "42" → 42 for a number field), while an
 * unresolved template string passes through the regex branch untouched.
 *
 * Purely additive (per the shared-package contract): existing literal values
 * still validate against `inner`.
 */
export function templatable<T extends z.ZodTypeAny>(inner: T, coerce?: (value: string) => unknown) {
  const union = z.union([inner, z.string().regex(TEMPLATE_VALUE_RE)]);
  if (!coerce) return union;
  return z.preprocess((value) => {
    if (typeof value === 'string' && !TEMPLATE_VALUE_RE.test(value)) return coerce(value);
    return value;
  }, union);
}
