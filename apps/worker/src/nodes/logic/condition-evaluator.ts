import { splitConditionOperator, type ConditionOperator } from '@tietide/shared';

type Operator = ConditionOperator;

export function evaluateCondition(condition: string): boolean {
  // The operator grammar is shared with the SPA builder (@tietide/shared) so a
  // condition the builder serialises always splits back the same way (#7).
  const tokens = splitConditionOperator(condition);
  if (!tokens) {
    throw new Error(`Invalid condition: no recognised operator in "${condition}"`);
  }
  const [leftRaw, op, rightRaw] = tokens;
  const left = parseLiteral(leftRaw, condition);
  const right = parseLiteral(rightRaw, condition);
  return compare(left, op, right);
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
      // Convert a single-quoted literal into a valid JSON (double-quoted) string.
      // Escape backslashes FIRST, then double-quotes — otherwise a literal `\` in
      // the operand would corrupt the escaping (e.g. turn our added `\"` back into
      // an escaped backslash + bare quote) and break the parse.
      const asJson = trimmed.startsWith("'")
        ? `"${trimmed.slice(1, -1).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
        : trimmed;
      return JSON.parse(asJson);
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
    case 'contains':
      // Array membership when the left operand is a list, else substring match.
      if (Array.isArray(left)) return left.includes(right);
      return String(left).includes(String(right));
  }
}
