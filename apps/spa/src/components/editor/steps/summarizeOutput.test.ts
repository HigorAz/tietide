import { describe, it, expect } from 'vitest';
import { summarizeOutput } from './summarizeOutput';

describe('summarizeOutput', () => {
  it('counts a top-level array', () => {
    expect(summarizeOutput(new Array(10).fill(0))).toBe('10 items');
  });

  it('uses the singular for a one-element array', () => {
    expect(summarizeOutput([1])).toBe('1 item');
  });

  it('counts the well-known collection key of an object (Gmail demo shape)', () => {
    const output = { messages: new Array(10).fill({}), resultSizeEstimate: 10 };
    expect(summarizeOutput(output)).toBe('10 items');
  });

  it('uses the singular for a one-element well-known collection key', () => {
    expect(summarizeOutput({ records: [{}] })).toBe('1 item');
  });

  it('prefers the meaningful collection key over an earlier non-collection array (WR-03)', () => {
    // `errors` comes first in insertion order but is NOT a collection key, so the
    // count must come from `messages` (50), not the empty `errors` array.
    const output = { errors: [], messages: new Array(50).fill({}) };
    expect(summarizeOutput(output)).toBe('50 items');
  });

  it('respects the collection-key priority order (items before results)', () => {
    const output = { results: new Array(3).fill({}), items: new Array(7).fill({}) };
    expect(summarizeOutput(output)).toBe('7 items');
  });

  it('says "output captured" rather than a misleading count for a non-collection array key (WR-03)', () => {
    // `tags` is an arbitrary array, not a recognised collection — previously this
    // reported "2 items"; now it neutrally says output was captured.
    expect(summarizeOutput({ tags: ['a', 'b'] })).toBe('output captured');
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
