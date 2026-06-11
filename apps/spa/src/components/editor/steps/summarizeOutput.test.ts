import { describe, it, expect } from 'vitest';
import { summarizeOutput } from './summarizeOutput';

describe('summarizeOutput', () => {
  it('counts a top-level array', () => {
    expect(summarizeOutput(new Array(10).fill(0))).toBe('10 items');
  });

  it('uses the singular for a one-element array', () => {
    expect(summarizeOutput([1])).toBe('1 item');
  });

  it('counts the first array-valued key of an object (Gmail demo shape)', () => {
    const output = { messages: new Array(10).fill({}), resultSizeEstimate: 10 };
    expect(summarizeOutput(output)).toBe('10 items');
  });

  it('uses the singular for a one-element first array key', () => {
    expect(summarizeOutput({ records: [{}] })).toBe('1 item');
  });

  it('falls back to "output captured" for an object with no array values', () => {
    expect(summarizeOutput({ id: 42, ok: true })).toBe('output captured');
  });

  it('falls back to "output captured" for null and primitives', () => {
    expect(summarizeOutput(null)).toBe('output captured');
    expect(summarizeOutput('hello')).toBe('output captured');
    expect(summarizeOutput(7)).toBe('output captured');
  });
});
