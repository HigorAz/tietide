import { EnvVarNotFoundError } from './errors.js';
import { FORBIDDEN_SEGMENTS, evaluateExpression, stringifyValue } from './expression.js';

// Re-exported so the public surface (and `index.ts`) is unchanged after the errors.ts split.
export { TemplatePathNotFoundError, EnvVarNotFoundError } from './errors.js';
// Operator catalog — single source of truth shared with the SPA "append operator" menu.
export { TEMPLATE_OPERATORS, type TemplateOperator } from './expression.js';

export type EnvScope = ReadonlyMap<string, string>;

export const TEMPLATE_TOKEN_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

const RESERVED_TOKEN_REGEX = /^[A-Z][A-Z0-9_]*$/;

export function resolveTemplate<T>(
  value: T,
  scope: Record<string, unknown>,
  envScope?: EnvScope,
): T;
export function resolveTemplate(
  value: unknown,
  scope: Record<string, unknown>,
  envScope?: EnvScope,
): unknown {
  if (typeof value === 'string') {
    return resolveString(value, scope, envScope);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplate(entry, scope, envScope));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_SEGMENTS.has(k)) continue;
      out[k] = resolveTemplate(v, scope, envScope);
    }
    return out;
  }
  return value;
}

function resolveString(
  input: string,
  scope: Record<string, unknown>,
  envScope: EnvScope | undefined,
): unknown {
  const tokens: { match: string; path: string; index: number }[] = [];
  TEMPLATE_TOKEN_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEMPLATE_TOKEN_REGEX.exec(input)) !== null) {
    const match = m[0];
    const rawPath = m[1];
    if (rawPath === undefined) continue;
    tokens.push({ match, path: rawPath.trim(), index: m.index });
  }

  if (tokens.length === 0) return input;

  const firstToken = tokens[0];
  if (tokens.length === 1 && firstToken !== undefined && firstToken.match === input) {
    if (RESERVED_TOKEN_REGEX.test(firstToken.path)) {
      // Single-token UPPER_SNAKE: substitute from envScope (or leave untouched if no scope).
      if (envScope === undefined) return input;
      return lookupEnv(envScope, firstToken.path);
    }
    return lookup(scope, firstToken.path);
  }

  let result = '';
  let cursor = 0;
  for (const tok of tokens) {
    result += input.slice(cursor, tok.index);
    if (RESERVED_TOKEN_REGEX.test(tok.path)) {
      if (envScope === undefined) {
        result += tok.match;
      } else {
        result += lookupEnv(envScope, tok.path);
      }
    } else {
      const resolved = lookup(scope, tok.path);
      result += stringifyValue(resolved);
    }
    cursor = tok.index + tok.match.length;
  }
  result += input.slice(cursor);
  return result;
}

function lookupEnv(envScope: EnvScope, key: string): string {
  const value = envScope.get(key);
  if (value === undefined) {
    throw new EnvVarNotFoundError(key);
  }
  return value;
}

// Resolve a single token expression (path + optional chained operators). Delegates to the
// expression engine, which is a strict superset of the original dot-walk.
function lookup(scope: Record<string, unknown>, path: string): unknown {
  return evaluateExpression(scope, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
