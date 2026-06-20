import { splitConditionOperator, type ConditionOperator } from './grammar.js';

/** Structured form of a Conditional node's comparison (the builder UI). */
export interface ConditionBuilder {
  left: string;
  operator: ConditionOperator;
  right: string;
}

/**
 * Serialize a structured condition to the canonical string form the worker
 * evaluates — operands separated from the operator by single spaces (the
 * contract {@link splitConditionOperator} relies on).
 */
export function builderToString(builder: ConditionBuilder): string {
  return `${builder.left.trim()} ${builder.operator} ${builder.right.trim()}`;
}

/**
 * Parse a canonical condition string back into the structured form, or null
 * when it doesn't fit the simple `left OP right` shape (a hand-written advanced
 * expression). The SPA uses this to open the builder when possible and fall
 * back to advanced (raw) mode otherwise — never corrupting the stored string.
 */
export function stringToBuilder(condition: string): ConditionBuilder | null {
  const parts = splitConditionOperator(condition);
  if (!parts) return null;
  const [left, operator, right] = parts;
  return { left, operator, right };
}
