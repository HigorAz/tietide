import { describe, expect, it } from 'vitest';
import {
  branchBadge,
  buildPillPath,
  childPath,
  classifyValue,
  flattenLeaves,
  formatScalar,
  matchesSearch,
} from './valueFormat';

describe('valueFormat', () => {
  describe('classifyValue', () => {
    it('classifies primitives, null/undefined, arrays and objects', () => {
      expect(classifyValue('hi')).toBe('string');
      expect(classifyValue(3)).toBe('number');
      expect(classifyValue(true)).toBe('boolean');
      expect(classifyValue(null)).toBe('null');
      expect(classifyValue(undefined)).toBe('null');
      expect(classifyValue([1])).toBe('array');
      expect(classifyValue({ a: 1 })).toBe('object');
    });
  });

  describe('formatScalar', () => {
    it('quotes strings, stringifies numbers/booleans/null', () => {
      expect(formatScalar('hi')).toBe('"hi"');
      expect(formatScalar(12)).toBe('12');
      expect(formatScalar(false)).toBe('false');
      expect(formatScalar(null)).toBe('null');
    });

    it('truncates strings longer than 160 chars to 160 + ellipsis', () => {
      const long = 'x'.repeat(200);
      const out = formatScalar(long);
      // quotes + 160 chars + ellipsis
      expect(out).toBe(`"${'x'.repeat(160)}…"`);
    });
  });

  describe('branchBadge', () => {
    it('renders item counts for arrays', () => {
      expect(branchBadge([1, 2, 3])).toBe('[3 items]');
      expect(branchBadge(['x'])).toBe('[1 item]');
    });

    it('renders field counts for objects', () => {
      expect(branchBadge({ a: 1, b: 2 })).toBe('{2 fields}');
      expect(branchBadge({ a: 1 })).toBe('{1 field}');
    });

    it('returns null for scalars', () => {
      expect(branchBadge('x')).toBeNull();
      expect(branchBadge(10)).toBeNull();
      expect(branchBadge(null)).toBeNull();
    });
  });

  describe('childPath', () => {
    it('joins identifier keys with a dot', () => {
      expect(childPath('', 'messages')).toBe('messages');
      expect(childPath('messages[0]', 'id')).toBe('messages[0].id');
    });

    it('joins numeric indexes with bracket syntax (no leading dot)', () => {
      expect(childPath('messages', 0)).toBe('messages[0]');
      expect(childPath('', 0)).toBe('[0]');
      expect(childPath('', 2)).toBe('[2]');
    });

    it('bracket-escapes non-identifier keys', () => {
      expect(childPath('a', 'weird key')).toBe("a['weird key']");
    });

    it('bracket-escapes operator-name keys', () => {
      expect(childPath('msg', 'upcase')).toBe("msg['upcase']");
      expect(childPath('msg', 'downcase')).toBe("msg['downcase']");
    });

    it('uses double quotes when the key contains a single quote', () => {
      expect(childPath('a', "it's")).toBe('a["it\'s"]');
    });
  });

  describe('buildPillPath', () => {
    it('delegates to buildPillToken for dotted paths', () => {
      expect(buildPillPath('steps.gmail_search', 'messages[0].id')).toBe(
        '{{steps.gmail_search.messages[0].id}}',
      );
    });

    it('joins without a dot when the path starts with a bracket', () => {
      expect(buildPillPath('steps.x', "['weird key']")).toBe("{{steps.x['weird key']}}");
      expect(buildPillPath('steps.x', '[0]')).toBe('{{steps.x[0]}}');
    });
  });

  describe('flattenLeaves', () => {
    it('flattens nested objects/arrays to scalar leaves depth-first', () => {
      expect(flattenLeaves({ messages: [{ id: 'a' }], n: 10 })).toEqual([
        { path: 'messages[0].id', value: 'a' },
        { path: 'n', value: 10 },
      ]);
    });

    it('flattens a top-level array with bracket-index paths', () => {
      expect(flattenLeaves([{ id: 'a' }, { id: 'b' }])).toEqual([
        { path: '[0].id', value: 'a' },
        { path: '[1].id', value: 'b' },
      ]);
      expect(flattenLeaves(['x', 'y'])).toEqual([
        { path: '[0]', value: 'x' },
        { path: '[1]', value: 'y' },
      ]);
    });
  });

  describe('matchesSearch', () => {
    it('matches case-insensitively on path', () => {
      expect(matchesSearch({ path: 'messages[0].id', value: 'abc' }, 'ID')).toBe(true);
    });

    it('matches on the formatted value', () => {
      expect(matchesSearch({ path: 'messages[0].id', value: 'abc' }, 'abc')).toBe(true);
    });

    it('returns false when neither path nor value matches', () => {
      expect(matchesSearch({ path: 'messages[0].id', value: 'abc' }, 'zz')).toBe(false);
    });
  });
});
