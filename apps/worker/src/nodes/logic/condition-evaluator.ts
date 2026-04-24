const TEMPLATE_PATTERN = /\{\{([^}]+)\}\}/g;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const OPERATORS = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'] as const;
type Operator = (typeof OPERATORS)[number];

export function resolveTemplates(template: string, data: Record<string, unknown>): string {
  return template.replace(TEMPLATE_PATTERN, (_match, rawPath: string) => {
    const value = lookupPath(data, rawPath.trim());
    return jsonLiteral(value);
  });
}

export function evaluateCondition(condition: string): boolean {
  const tokens = splitOnOperator(condition);
  if (!tokens) {
    throw new Error(`Invalid condition: no recognised operator in "${condition}"`);
  }
  const [leftRaw, op, rightRaw] = tokens;
  const left = parseLiteral(leftRaw, condition);
  const right = parseLiteral(rightRaw, condition);
  return compare(left, op, right);
}

function lookupPath(data: Record<string, unknown>, path: string): unknown {
  if (path.length === 0) return undefined;
  const segments = path.split('.');
  let current: unknown = data;
  for (const segment of segments) {
    if (FORBIDDEN_KEYS.has(segment)) return undefined;
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function jsonLiteral(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

function splitOnOperator(condition: string): [string, Operator, string] | null {
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < condition.length; i++) {
    const ch = condition[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    for (const op of OPERATORS) {
      if (
        condition.startsWith(op, i) &&
        condition[i - 1] === ' ' &&
        condition[i + op.length] === ' '
      ) {
        const left = condition.slice(0, i - 1).trim();
        const right = condition.slice(i + op.length + 1).trim();
        if (left.length === 0 || right.length === 0) return null;
        return [left, op, right];
      }
    }
  }
  return null;
}

function parseLiteral(raw: string, fullCondition: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'undefined') return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(
        trimmed.startsWith("'") ? `"${trimmed.slice(1, -1).replace(/"/g, '\\"')}"` : trimmed,
      );
    } catch {
      throw new Error(
        `Invalid condition: cannot parse string literal "${trimmed}" in "${fullCondition}"`,
      );
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(
        `Invalid condition: cannot parse JSON literal "${trimmed}" in "${fullCondition}"`,
      );
    }
  }
  throw new Error(`Invalid condition: unrecognised operand "${trimmed}" in "${fullCondition}"`);
}

function compare(left: unknown, op: Operator, right: unknown): boolean {
  switch (op) {
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '==':
      return left == right;
    case '!=':
      return left != right;
    case '>':
      return (left as number) > (right as number);
    case '<':
      return (left as number) < (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '<=':
      return (left as number) <= (right as number);
  }
}
