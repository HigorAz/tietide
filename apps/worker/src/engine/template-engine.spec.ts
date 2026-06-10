import { EnvVarNotFoundError, resolveTemplate, TemplatePathNotFoundError } from '@tietide/shared';

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

    it('should insert a string value WITHOUT surrounding quotes when embedded in text', () => {
      // A Code node OUTPUT SAMPLE like { count: "1" } makes `count` a string. When
      // referenced inside a message it must read `…: 1`, never `…: "1"`.
      const scope = { steps: { code: { count: '1' } } };
      expect(resolveTemplate('emails: {{steps.code.count}}', scope)).toBe('emails: 1');
    });

    it('should resolve multiple tokens in a single string', () => {
      const scope = { a: { first: 'x' }, b: { second: 'y' } };
      expect(resolveTemplate('{{a.first}}-{{b.second}}', scope)).toBe('x-y');
    });

    it('should pass through a literal string with no tokens unchanged', () => {
      expect(resolveTemplate('plain text', {})).toBe('plain text');
    });

    it('should leave UPPER_SNAKE tokens untouched when no envScope is provided', () => {
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

  describe('env vars (envScope)', () => {
    it('should substitute an UPPER_SNAKE token from envScope when provided', () => {
      const envScope = new Map<string, string>([['API_KEY', 'sk-live-123']]);
      expect(resolveTemplate('{{API_KEY}}', {}, envScope)).toBe('sk-live-123');
    });

    it('should substitute UPPER_SNAKE tokens mixed with literal text', () => {
      const envScope = new Map<string, string>([['API_KEY', 'sk-live-123']]);
      expect(resolveTemplate('Bearer {{API_KEY}}', {}, envScope)).toBe('Bearer sk-live-123');
    });

    it('should resolve env tokens AND data tokens in the same string', () => {
      const envScope = new Map<string, string>([['BASE_URL', 'https://api.example.com']]);
      const scope = { trigger: { id: 'abc' } };
      expect(resolveTemplate('{{BASE_URL}}/x/{{trigger.id}}', scope, envScope)).toBe(
        'https://api.example.com/x/abc',
      );
    });

    it('should throw EnvVarNotFoundError with the issue-specified message when missing', () => {
      const envScope = new Map<string, string>();
      try {
        resolveTemplate('{{SLACK_WEBHOOK_URL}}', {}, envScope);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(EnvVarNotFoundError);
        expect((err as Error).message).toBe(
          'Env var SLACK_WEBHOOK_URL not found in user or global scope',
        );
        expect((err as EnvVarNotFoundError).key).toBe('SLACK_WEBHOOK_URL');
      }
    });

    it('should leave UPPER_SNAKE tokens untouched when envScope is undefined (back-compat)', () => {
      expect(resolveTemplate('{{API_KEY}}', {})).toBe('{{API_KEY}}');
    });

    it('should preserve recursion into nested objects', () => {
      const envScope = new Map<string, string>([['BASE_URL', 'https://api']]);
      const value = { url: '{{BASE_URL}}/v1', headers: { auth: 'Bearer {{TOKEN}}' } };
      const envWithToken = new Map<string, string>([
        ['BASE_URL', 'https://api'],
        ['TOKEN', 't-1'],
      ]);
      expect(resolveTemplate(value, {}, envWithToken)).toEqual({
        url: 'https://api/v1',
        headers: { auth: 'Bearer t-1' },
      });
      // sanity: missing TOKEN throws even when nested
      expect(() => resolveTemplate(value, {}, envScope)).toThrow(EnvVarNotFoundError);
    });

    it('should NOT use envScope for lowercase tokens (those still resolve via data scope)', () => {
      const envScope = new Map<string, string>([['FOO', 'env-value']]);
      // lowercase 'foo' is a data path, not an env var
      expect(resolveTemplate('{{foo}}', { foo: 'data-value' }, envScope)).toBe('data-value');
    });

    it('should preserve the env value type when single-token (always a string)', () => {
      const envScope = new Map<string, string>([['TOKEN', 'plain-string']]);
      expect(resolveTemplate('{{TOKEN}}', {}, envScope)).toBe('plain-string');
    });
  });
});
