import { describe, it, expect } from 'vitest';
import {
  builderToString,
  stringToBuilder,
  CONDITION_OPERATORS,
  type ConditionBuilder,
} from '@tietide/shared';

// The condition grammar lives in @tietide/shared (no own test runner); exercised
// here in the SPA's vitest suite — the same builder ⇄ string round-trip the
// ConditionalForm relies on.
describe('condition serialize', () => {
  it('round-trips every operator', () => {
    for (const operator of CONDITION_OPERATORS) {
      const builder: ConditionBuilder = { left: '{{trigger.amount}}', operator, right: '100' };
      expect(stringToBuilder(builderToString(builder))).toEqual(builder);
    }
  });

  it('serializes operands with single spaces around the operator', () => {
    expect(builderToString({ left: '{{trigger.amount}}', operator: '>', right: '100' })).toBe(
      '{{trigger.amount}} > 100',
    );
  });

  it('parses a pill-operand condition into the builder', () => {
    expect(stringToBuilder('{{trigger.status}} === "active"')).toEqual({
      left: '{{trigger.status}}',
      operator: '===',
      right: '"active"',
    });
  });

  it('does not split on an operator inside a quoted operand', () => {
    expect(stringToBuilder('{{a}} === "x > y"')).toEqual({
      left: '{{a}}',
      operator: '===',
      right: '"x > y"',
    });
  });

  it('returns null for an unparseable / advanced expression', () => {
    expect(stringToBuilder('someFunc(1, 2)')).toBeNull();
    expect(stringToBuilder('')).toBeNull();
  });

  it('matches >= before > when both could apply', () => {
    expect(stringToBuilder('{{x}} >= 5')).toEqual({ left: '{{x}}', operator: '>=', right: '5' });
  });
});
