import { resolveTemplate, TemplatePathNotFoundError, TEMPLATE_OPERATORS } from '@tietide/shared';

/**
 * Unit tests for the chained-method expression engine (#258). Exercises the public
 * `resolveTemplate` contract because single-token tokens return the raw resolved value,
 * which is the cleanest way to assert grammar + operator behavior end-to-end.
 */
describe('expression engine (chained methods)', () => {
  describe('grammar: path operator*', () => {
    it('should treat [n] identically to .n for index access', () => {
      const scope = { a: { items: ['x', 'y', 'z'] } };
      expect(resolveTemplate('{{a.items[0]}}', scope)).toBe('x');
      expect(resolveTemplate('{{a.items.0}}', scope)).toBe('x');
      expect(resolveTemplate('{{a.items[2]}}', scope)).toBe('z');
    });

    it('should resolve a deep mixed path + index chain (issue example)', () => {
      const scope = { http_1: { body: { items: [{ name: 'first-item' }, { name: 'second' }] } } };
      expect(resolveTemplate('{{http_1.body.items[0].name}}', scope)).toBe('first-item');
    });

    it('should apply an operator then continue with key access', () => {
      const scope = { gmail_1: { messages: [{ subject: 'Hello' }, { subject: 'Bye' }] } };
      expect(resolveTemplate('{{gmail_1.messages.first.subject}}', scope)).toBe('Hello');
    });

    it("should use ['key'] to escape a literal key named like an operator", () => {
      const scope = { a: { first: 'literal-value', list: [1, 2] } };
      // bare .first is the operator → first element of the list
      expect(resolveTemplate('{{a.list.first}}', scope)).toBe(1);
      // ['first'] escapes to the literal key
      expect(resolveTemplate("{{a['first']}}", scope)).toBe('literal-value');
    });
  });

  describe('operators — happy path', () => {
    const scope = {
      d: {
        arr: ['a', 'b', 'c'],
        empty: [] as unknown[],
        str: '  Hi There  ',
        upper: 'mixED',
        numStr: '42',
        floatStr: '3.14',
        n: 7,
        obj: { x: 1, y: 2 },
        nil: null as unknown,
        tags: ['x', 'y', 'z'],
      },
    };

    it('first → first element', () => {
      expect(resolveTemplate('{{d.arr.first}}', scope)).toBe('a');
    });
    it('last → last element', () => {
      expect(resolveTemplate('{{d.arr.last}}', scope)).toBe('c');
    });
    it('size → length of array/string/object', () => {
      expect(resolveTemplate('{{d.arr.size}}', scope)).toBe(3);
      expect(resolveTemplate('{{d.upper.size}}', scope)).toBe(5);
      expect(resolveTemplate('{{d.obj.size}}', scope)).toBe(2);
    });
    it('length → length (alias of size)', () => {
      expect(resolveTemplate('{{d.arr.length}}', scope)).toBe(3);
    });
    it('present? → boolean', () => {
      expect(resolveTemplate('{{d.arr.present?}}', scope)).toBe(true);
      expect(resolveTemplate('{{d.empty.present?}}', scope)).toBe(false);
    });
    it('blank? → boolean', () => {
      expect(resolveTemplate('{{d.empty.blank?}}', scope)).toBe(true);
      expect(resolveTemplate('{{d.arr.blank?}}', scope)).toBe(false);
    });
    it('to_s → string', () => {
      expect(resolveTemplate('{{d.n.to_s}}', scope)).toBe('7');
    });
    it('to_i → integer', () => {
      expect(resolveTemplate('{{d.numStr.to_i}}', scope)).toBe(42);
      expect(resolveTemplate('{{d.floatStr.to_i}}', scope)).toBe(3);
    });
    it('to_n → number', () => {
      expect(resolveTemplate('{{d.floatStr.to_n}}', scope)).toBe(3.14);
    });
    it('upcase / downcase → cased string', () => {
      expect(resolveTemplate('{{d.upper.upcase}}', scope)).toBe('MIXED');
      expect(resolveTemplate('{{d.upper.downcase}}', scope)).toBe('mixed');
    });
    it('strip / trim → trimmed string', () => {
      expect(resolveTemplate('{{d.str.strip}}', scope)).toBe('Hi There');
      expect(resolveTemplate('{{d.str.trim}}', scope)).toBe('Hi There');
    });
    it('default(x) → x when value is null/undefined', () => {
      expect(resolveTemplate('{{d.nil.default("fallback")}}', scope)).toBe('fallback');
      expect(resolveTemplate('{{d.nil.default(0)}}', scope)).toBe(0);
      // present value is unchanged by default
      expect(resolveTemplate('{{d.n.default(99)}}', scope)).toBe(7);
    });
    it('keys / values → object keys/values', () => {
      expect(resolveTemplate('{{d.obj.keys}}', scope)).toEqual(['x', 'y']);
      expect(resolveTemplate('{{d.obj.values}}', scope)).toEqual([1, 2]);
    });
    it('join(sep) → joined string', () => {
      expect(resolveTemplate('{{d.tags.join(", ")}}', scope)).toBe('x, y, z');
      expect(resolveTemplate("{{d.tags.join('-')}}", scope)).toBe('x-y-z');
    });
  });

  describe('operators — type mismatch returns the undefined sentinel, never throws', () => {
    const scope = { d: { n: 7, s: 'hello', arr: [1, 2] } };

    it('first/last on a non-array → undefined', () => {
      expect(resolveTemplate('{{d.n.first}}', scope)).toBeUndefined();
      expect(resolveTemplate('{{d.s.last}}', scope)).toBeUndefined();
    });
    it('upcase/downcase/strip on a non-string → undefined', () => {
      expect(resolveTemplate('{{d.n.upcase}}', scope)).toBeUndefined();
      expect(resolveTemplate('{{d.arr.downcase}}', scope)).toBeUndefined();
      expect(resolveTemplate('{{d.n.strip}}', scope)).toBeUndefined();
    });
    it('to_i/to_n on a non-numeric string → undefined', () => {
      expect(resolveTemplate('{{d.s.to_i}}', scope)).toBeUndefined();
      expect(resolveTemplate('{{d.s.to_n}}', scope)).toBeUndefined();
    });
    it('keys/values on a non-object → undefined', () => {
      expect(resolveTemplate('{{d.n.keys}}', scope)).toBeUndefined();
      expect(resolveTemplate('{{d.arr.values}}', scope)).toBeUndefined();
    });
    it('join on a non-array → undefined', () => {
      expect(resolveTemplate('{{d.s.join(",")}}', scope)).toBeUndefined();
    });
    it('size on a number → undefined', () => {
      expect(resolveTemplate('{{d.n.size}}', scope)).toBeUndefined();
    });
  });

  describe('single-token returns raw value; interpolation stringifies', () => {
    const scope = { x: { items: [{ id: 1 }, { id: 2 }], flag: 'yes', size3: [1, 2, 3] } };

    it('single-token returns the raw element/object', () => {
      expect(resolveTemplate('{{x.items.first}}', scope)).toEqual({ id: 1 });
    });
    it('single-token returns a raw boolean for predicates', () => {
      expect(resolveTemplate('{{x.flag.present?}}', scope)).toBe(true);
    });
    it('interpolation stringifies the operator result', () => {
      expect(resolveTemplate('count={{x.size3.size}}', scope)).toBe('count=3');
      expect(resolveTemplate('present={{x.flag.present?}}', scope)).toBe('present=true');
    });
  });

  describe('error semantics: missing path throws, operator mismatch does not', () => {
    it('throws TemplatePathNotFoundError for a missing key mid-chain', () => {
      expect(() => resolveTemplate('{{a.nope.first}}', { a: { other: 1 } })).toThrow(
        TemplatePathNotFoundError,
      );
    });
    it('throws for an out-of-range index (index == path access)', () => {
      expect(() => resolveTemplate('{{a.list[5]}}', { a: { list: [1, 2] } })).toThrow(
        TemplatePathNotFoundError,
      );
    });
    it('keeps the prototype-pollution ban on path segments', () => {
      expect(() => resolveTemplate('{{a.__proto__}}', { a: {} })).toThrow(
        TemplatePathNotFoundError,
      );
      expect(() => resolveTemplate('{{a.constructor}}', { a: {} })).toThrow(
        TemplatePathNotFoundError,
      );
    });
    it('chaining a key onto an operator-mismatch sentinel throws (undefined is not an object)', () => {
      expect(() => resolveTemplate('{{d.n.first.subject}}', { d: { n: 7 } })).toThrow(
        TemplatePathNotFoundError,
      );
    });
  });

  describe('TEMPLATE_OPERATORS catalog (single source of truth for UI + engine)', () => {
    it('exposes all 17 allowlisted operators', () => {
      const names = TEMPLATE_OPERATORS.map((o) => o.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'first',
          'last',
          'size',
          'length',
          'present?',
          'blank?',
          'to_s',
          'to_i',
          'to_n',
          'upcase',
          'downcase',
          'strip',
          'trim',
          'default',
          'keys',
          'values',
          'join',
        ]),
      );
      expect(names).toHaveLength(17);
    });

    it('flags the arg-taking operators (default, join)', () => {
      const withArgs = TEMPLATE_OPERATORS.filter((o) => o.hasArg)
        .map((o) => o.name)
        .sort();
      expect(withArgs).toEqual(['default', 'join']);
    });
  });
});
