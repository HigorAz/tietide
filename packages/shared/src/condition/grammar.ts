/**
 * Canonical comparison grammar for the Conditional (IF) node, shared by the
 * worker evaluator and the SPA structured-builder so the two never disagree
 * on how a condition string splits into operands (#7).
 *
 * Symbol operators come first so longer ones match before their prefixes
 * (`===` before `==`, `>=` before `>`). Word operators (e.g. `contains`) come
 * last; the space-delimited match treats them as whole words.
 */
export const CONDITION_OPERATORS = [
  '===',
  '!==',
  '==',
  '!=',
  '>=',
  '<=',
  '>',
  '<',
  'contains',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/**
 * Split a condition into `[left, operator, right]` on the first top-level
 * operator (operators inside quoted string literals are ignored). The operator
 * must be surrounded by spaces — the same contract the structured builder emits
 * via {@link builderToString}. Returns null when no operator is found or either
 * operand is empty.
 */
export function splitConditionOperator(
  condition: string,
): [string, ConditionOperator, string] | null {
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < condition.length; i++) {
    const ch = condition[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    for (const op of CONDITION_OPERATORS) {
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
