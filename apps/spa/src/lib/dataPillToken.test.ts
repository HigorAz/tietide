import { describe, expect, it } from 'vitest';
import { buildPillToken, findOpenTokenStart, insertToken, splitSegments } from './dataPillToken';

describe('dataPillToken', () => {
  describe('splitSegments', () => {
    it('returns a single literal segment for plain text', () => {
      expect(splitSegments('hello world')).toEqual([{ kind: 'literal', text: 'hello world' }]);
    });

    it('classifies a token between literals', () => {
      expect(splitSegments('a {{ node1.path }} b')).toEqual([
        { kind: 'literal', text: 'a ' },
        { kind: 'token', text: '{{ node1.path }}' },
        { kind: 'literal', text: ' b' },
      ]);
    });

    it('classifies an ALL_CAPS inner token as reserved', () => {
      expect(splitSegments('{{ RESULT }}')).toEqual([{ kind: 'reserved', text: '{{ RESULT }}' }]);
    });

    it('is reusable across calls (global regex lastIndex reset)', () => {
      const v = '{{ a.b }}';
      expect(splitSegments(v)).toEqual(splitSegments(v));
    });
  });

  describe('findOpenTokenStart', () => {
    it('returns the index of an unclosed {{ before the caret', () => {
      const text = 'url={{ nod';
      expect(findOpenTokenStart(text, text.length)).toBe(4);
    });

    it('returns null when there is no {{ before the caret', () => {
      expect(findOpenTokenStart('plain', 5)).toBeNull();
    });

    it('returns null when the {{ is already closed before the caret', () => {
      const text = '{{ a.b }} more';
      expect(findOpenTokenStart(text, text.length)).toBeNull();
    });
  });

  describe('buildPillToken', () => {
    it('builds a ref.path token', () => {
      expect(buildPillToken('node1', 'user.email')).toBe('{{node1.user.email}}');
    });

    it('builds trigger and steps alias tokens', () => {
      expect(buildPillToken('trigger', 'channelId')).toBe('{{trigger.channelId}}');
      expect(buildPillToken('steps.gmail_search', 'subject')).toBe(
        '{{steps.gmail_search.subject}}',
      );
    });

    it('drops the trailing dot when the path is empty (whole-output pill)', () => {
      expect(buildPillToken('trigger', '')).toBe('{{trigger}}');
    });
  });

  describe('insertToken', () => {
    it('inserts at the caret when not inside an open token', () => {
      const result = insertToken('a b', '{{x}}', 2);
      expect(result.value).toBe('a {{x}}b');
      expect(result.caret).toBe(2 + '{{x}}'.length);
    });

    it('replaces an open {{ token from its start to the caret', () => {
      const value = 'url={{ no';
      const result = insertToken(value, '{{node1.id}}', value.length);
      expect(result.value).toBe('url={{node1.id}}');
      expect(result.caret).toBe('url='.length + '{{node1.id}}'.length);
    });

    it('clamps an out-of-range caret to the value length', () => {
      const result = insertToken('abc', '{{x}}', 999);
      expect(result.value).toBe('abc{{x}}');
      expect(result.caret).toBe('abc{{x}}'.length);
    });
  });
});
