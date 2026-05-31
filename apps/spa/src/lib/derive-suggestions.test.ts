import { describe, expect, it } from 'vitest';
import { derivePathsFromSample } from './derive-suggestions';

const paths = (sample: unknown): string[] => derivePathsFromSample(sample).map((e) => e.path);

describe('derivePathsFromSample', () => {
  it('lists top-level keys of a flat object with their JS types', () => {
    expect(derivePathsFromSample({ name: 'a', age: 1, ok: true })).toEqual([
      { path: 'name', type: 'string' },
      { path: 'age', type: 'number' },
      { path: 'ok', type: 'boolean' },
    ]);
  });

  it('joins nested object keys with dots', () => {
    expect(paths({ user: { email: 'x@y.z' } })).toEqual(['user.email']);
  });

  it('uses `.0` for array elements (mirrors walkSchema)', () => {
    expect(paths({ items: [{ id: '1', name: 'n' }] })).toEqual(['items.0.id', 'items.0.name']);
  });

  it('represents an array of primitives as `<prefix>.0`', () => {
    expect(derivePathsFromSample({ tags: ['a', 'b'] })).toEqual([
      { path: 'tags.0', type: 'string' },
    ]);
  });

  it('represents an empty array as an array-element placeholder', () => {
    expect(derivePathsFromSample({ list: [] })).toEqual([
      { path: 'list.0', type: 'array-element' },
    ]);
  });

  it('collapses an empty nested object to a single object entry', () => {
    expect(derivePathsFromSample({ meta: {} })).toEqual([{ path: 'meta', type: 'object' }]);
  });

  it('emits a root-level entry for a primitive sample', () => {
    expect(derivePathsFromSample('hello')).toEqual([{ path: '', type: 'string' }]);
  });

  it('returns nothing for a root empty object', () => {
    expect(derivePathsFromSample({})).toEqual([]);
  });

  it('returns nothing for null/undefined samples at the root', () => {
    expect(derivePathsFromSample(null)).toEqual([]);
    expect(derivePathsFromSample(undefined)).toEqual([]);
  });

  it('labels a nested null leaf as null', () => {
    expect(derivePathsFromSample({ a: null })).toEqual([{ path: 'a', type: 'null' }]);
  });

  it('caps recursion depth (mirrors walkSchema MAX_DEPTH)', () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    const result = paths(deep);
    expect(result).toContain('a.b.c.d');
    expect(result.some((p) => p.split('.').length > 4)).toBe(false);
  });
});
