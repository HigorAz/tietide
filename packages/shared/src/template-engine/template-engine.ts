export class TemplatePathNotFoundError extends Error {
  public readonly path: string;
  constructor(path: string) {
    super(`Template path not found: ${path}`);
    this.name = 'TemplatePathNotFoundError';
    this.path = path;
  }
}

export class EnvVarNotFoundError extends Error {
  public readonly key: string;
  constructor(key: string) {
    super(`Env var ${key} not found in user or global scope`);
    this.name = 'EnvVarNotFoundError';
    this.key = key;
  }
}

export type EnvScope = ReadonlyMap<string, string>;

export const TEMPLATE_TOKEN_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

const RESERVED_TOKEN_REGEX = /^[A-Z][A-Z0-9_]*$/;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

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
      result += stringifyForInterpolation(resolved);
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

function lookup(scope: Record<string, unknown>, path: string): unknown {
  if (path.length === 0) {
    throw new TemplatePathNotFoundError(path);
  }
  const segments = path.split('.');
  let current: unknown = scope;
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      throw new TemplatePathNotFoundError(path);
    }
    if (current === null || current === undefined || typeof current !== 'object') {
      throw new TemplatePathNotFoundError(path);
    }
    const obj = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, segment)) {
      throw new TemplatePathNotFoundError(path);
    }
    current = obj[segment];
  }
  return current;
}

function stringifyForInterpolation(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
