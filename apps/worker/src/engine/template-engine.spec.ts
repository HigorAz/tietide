import { resolveTemplate, TemplatePathNotFoundError } from '@tietide/shared';

describe('resolveTemplate', () => {
  describe('strings', () => {
    it('should interpolate a single token mixed with literal text', () => {
      expect(resolveTemplate('hello {{a.b}}', { a: { b: 'world' } })).toBe('hello world');
    });

    it('should preserve the resolved value type when the entire string is one token', () => {
      const scope = { a: { count: 42, payload: { ok: true } } };
      expect(resolveTemplate('{{a.count}}', scope)).toBe(42);
      expect(resolveTemplate('{{a.payload}}', scope)).toEqual({ ok: true });
    });

    it('should JSON-stringify objects and arrays when interpolated alongside literal text', () => {
      const scope = { a: { items: [1, 2, 3] } };
      expect(resolveTemplate('items: {{a.items}}', scope)).toBe('items: [1,2,3]');
    });

    it('should resolve multiple tokens in a single string', () => {
      const scope = { a: { first: 'x' }, b: { second: 'y' } };
      expect(resolveTemplate('{{a.first}}-{{b.second}}', scope)).toBe('x-y');
    });

    it('should pass through a literal string with no tokens unchanged', () => {
      expect(resolveTemplate('plain text', {})).toBe('plain text');
    });

    it('should leave UPPER_SNAKE tokens untouched (env var prefix reserved for F5)', () => {
      expect(resolveTemplate('Bearer {{API_KEY}}', { API_KEY: 'secret' })).toBe(
        'Bearer {{API_KEY}}',
      );
      expect(resolveTemplate('{{BASE_URL}}/path', {})).toBe('{{BASE_URL}}/path');
    });

    it('should still resolve a token that mixes case after the first letter', () => {
      expect(resolveTemplate('{{A_b}}', { A_b: 'mixed' })).toBe('mixed');
    });

    it('should tolerate whitespace inside the token braces', () => {
      expect(resolveTemplate('{{  a.b  }}', { a: { b: 'x' } })).toBe('x');
    });
  });

  describe('recursion', () => {
    it('should recursively resolve nested object values', () => {
      const scope = { trigger: { id: 'abc', email: 'a@b' } };
      const value = {
        url: 'https://api/x/{{trigger.id}}',
        headers: { 'X-Email': '{{trigger.email}}' },
      };
      expect(resolveTemplate(value, scope)).toEqual({
        url: 'https://api/x/abc',
        headers: { 'X-Email': 'a@b' },
      });
    });

    it('should recursively resolve every element of an array', () => {
      const scope = { a: { x: 1, y: 2 } };
      expect(resolveTemplate(['{{a.x}}', '{{a.y}}', 'plain'], scope)).toEqual([1, 2, 'plain']);
    });

    it('should recursively resolve nested arrays of objects', () => {
      const scope = { a: { name: 'Alice' } };
      expect(resolveTemplate({ users: [{ label: 'hello {{a.name}}' }] }, scope)).toEqual({
        users: [{ label: 'hello Alice' }],
      });
    });

    it('should leave non-string scalar values (number, bool, null) untouched', () => {
      expect(resolveTemplate({ n: 42, ok: true, nothing: null }, {})).toEqual({
        n: 42,
        ok: true,
        nothing: null,
      });
    });
  });

  describe('errors', () => {
    it('should throw TemplatePathNotFoundError when the root id is unknown', () => {
      expect(() => resolveTemplate('{{missing.x}}', {})).toThrow(TemplatePathNotFoundError);
    });

    it('should attach the failing path on the thrown error', () => {
      try {
        resolveTemplate('{{a.missing}}', { a: { other: 1 } });
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(TemplatePathNotFoundError);
        expect((err as TemplatePathNotFoundError).path).toBe('a.missing');
        expect((err as Error).message).toContain('a.missing');
      }
    });

    it('should throw when traversing into a non-object segment', () => {
      expect(() => resolveTemplate('{{a.b.c}}', { a: { b: 'string' } })).toThrow(
        TemplatePathNotFoundError,
      );
    });

    it('should reject __proto__ / constructor / prototype path segments', () => {
      const scope: Record<string, unknown> = { a: {} };
      expect(() => resolveTemplate('{{a.__proto__.toString}}', scope)).toThrow(
        TemplatePathNotFoundError,
      );
      expect(() => resolveTemplate('{{a.constructor}}', scope)).toThrow(TemplatePathNotFoundError);
      expect(() => resolveTemplate('{{a.prototype}}', scope)).toThrow(TemplatePathNotFoundError);
    });

    it('should throw with the original token path even when whitespace was used inside braces', () => {
      try {
        resolveTemplate('{{  a.missing  }}', { a: {} });
        fail('expected throw');
      } catch (err) {
        expect((err as TemplatePathNotFoundError).path).toBe('a.missing');
      }
    });
  });
});
