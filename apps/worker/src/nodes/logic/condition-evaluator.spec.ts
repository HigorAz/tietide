import { evaluateCondition, resolveTemplates } from './condition-evaluator';

describe('condition-evaluator', () => {
  describe('resolveTemplates', () => {
    it('should replace a single {{key}} placeholder with a primitive value', () => {
      expect(resolveTemplates('{{statusCode}} === 200', { statusCode: 200 })).toBe('200 === 200');
    });

    it('should resolve a nested dot-path', () => {
      const data = { response: { status: 'ok' } };
      expect(resolveTemplates('{{response.status}} === "ok"', data)).toBe('"ok" === "ok"');
    });

    it('should render a missing path as the literal "undefined"', () => {
      expect(resolveTemplates('{{missing.path}} === null', {})).toBe('undefined === null');
    });

    it('should refuse to walk through __proto__ / constructor / prototype', () => {
      const data = { a: { b: 1 } };
      expect(resolveTemplates('{{a.__proto__.toString}} === null', data)).toBe(
        'undefined === null',
      );
      expect(resolveTemplates('{{a.constructor}} === null', data)).toBe('undefined === null');
      expect(resolveTemplates('{{a.prototype}} === null', data)).toBe('undefined === null');
    });

    it('should JSON-stringify object and array values for round-trip safety', () => {
      const data = { obj: { a: 1 }, arr: [1, 2] };
      expect(resolveTemplates('{{obj}} === null', data)).toBe('{"a":1} === null');
      expect(resolveTemplates('{{arr}} === null', data)).toBe('[1,2] === null');
    });

    it('should escape strings as JSON literals so they are valid operands', () => {
      const data = { msg: 'hello world' };
      expect(resolveTemplates('{{msg}} === "hello world"', data)).toBe(
        '"hello world" === "hello world"',
      );
    });

    it('should leave unmatched braces alone', () => {
      expect(resolveTemplates('plain string', {})).toBe('plain string');
    });
  });

  describe('evaluateCondition', () => {
    it('should return true for a satisfied strict equality', () => {
      expect(evaluateCondition('200 === 200')).toBe(true);
    });

    it('should return false for an unsatisfied strict equality', () => {
      expect(evaluateCondition('200 === 201')).toBe(false);
    });

    it('should support strict inequality', () => {
      expect(evaluateCondition('"ok" !== "fail"')).toBe(true);
      expect(evaluateCondition('"ok" !== "ok"')).toBe(false);
    });

    it('should support loose equality', () => {
      expect(evaluateCondition('1 == 1')).toBe(true);
      expect(evaluateCondition('1 != 2')).toBe(true);
    });

    it('should support relational operators on numbers', () => {
      expect(evaluateCondition('5 > 3')).toBe(true);
      expect(evaluateCondition('5 < 3')).toBe(false);
      expect(evaluateCondition('5 >= 5')).toBe(true);
      expect(evaluateCondition('4 <= 5')).toBe(true);
    });

    it('should compare null, true, and false literals', () => {
      expect(evaluateCondition('null === null')).toBe(true);
      expect(evaluateCondition('true === true')).toBe(true);
      expect(evaluateCondition('false === false')).toBe(true);
      expect(evaluateCondition('true === false')).toBe(false);
    });

    it('should compare strings that contain operator-like substrings', () => {
      expect(evaluateCondition('"a > b" === "a > b"')).toBe(true);
    });

    it('should throw on a condition with no recognised operator', () => {
      expect(() => evaluateCondition('not valid')).toThrow(/invalid condition/i);
    });

    it('should throw on an unparseable left operand', () => {
      expect(() => evaluateCondition('foo === 1')).toThrow(/invalid condition/i);
    });

    it('should throw on an unparseable right operand', () => {
      expect(() => evaluateCondition('1 === foo')).toThrow(/invalid condition/i);
    });

    it('should throw on an empty condition', () => {
      expect(() => evaluateCondition('')).toThrow(/invalid condition/i);
    });
  });
});
