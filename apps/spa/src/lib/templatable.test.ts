import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { templatable, coerceNumeric, TEMPLATE_VALUE_RE } from '@tietide/shared';

// `templatable` lives in @tietide/shared (which ships no test runner of its
// own); the SPA depends on zod directly, so its behaviour is exercised here.
describe('templatable', () => {
  const numberField = templatable(z.number().int().min(1), coerceNumeric);

  it('accepts a literal of the inner type', () => {
    expect(numberField.parse(42)).toBe(42);
  });

  it('accepts a resolved sole-token value (already the real typed value)', () => {
    expect(numberField.parse(7)).toBe(7);
  });

  it('coerces an already-resolved numeric string', () => {
    expect(numberField.parse('42')).toBe(42);
  });

  it('passes an unresolved template string through untouched', () => {
    expect(numberField.parse('{{trigger.issue.number}}')).toBe('{{trigger.issue.number}}');
  });

  it('rejects a non-numeric, non-template string (an interpolated value)', () => {
    expect(() => numberField.parse('#42')).toThrow();
  });

  it('rejects an empty string rather than coercing it to 0', () => {
    expect(() => numberField.parse('')).toThrow();
  });

  it('still enforces the inner constraints on literals', () => {
    expect(() => numberField.parse(0)).toThrow(); // min(1)
  });

  it('composes with .optional()', () => {
    const optional = templatable(z.number(), coerceNumeric).optional();
    expect(optional.parse(undefined)).toBeUndefined();
    expect(optional.parse('{{x}}')).toBe('{{x}}');
  });

  it('works without a coercer (enum/string fields)', () => {
    const enumField = templatable(z.enum(['merge', 'squash']));
    expect(enumField.parse('merge')).toBe('merge');
    expect(enumField.parse('{{trigger.method}}')).toBe('{{trigger.method}}');
    expect(() => enumField.parse('not-an-option')).toThrow();
  });

  it('TEMPLATE_VALUE_RE detects a pill token', () => {
    expect(TEMPLATE_VALUE_RE.test('{{a}}')).toBe(true);
    expect(TEMPLATE_VALUE_RE.test('plain')).toBe(false);
  });
});
