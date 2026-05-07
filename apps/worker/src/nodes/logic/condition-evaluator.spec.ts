import { evaluateCondition } from './condition-evaluator';

describe('condition-evaluator', () => {
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

    it('should ignore operators inside backslash-escaped string literals', () => {
      // The escape sequence \" must not terminate the string, so the === inside is part of the literal.
      expect(evaluateCondition('"a\\" === b" === "a\\" === b"')).toBe(true);
    });

    it('should support single-quoted string operands', () => {
      expect(evaluateCondition("'hello' === 'hello'")).toBe(true);
    });

    it('should throw a descriptive error when an object literal operand is malformed JSON', () => {
      expect(() => evaluateCondition('{not: json} === 1')).toThrow(/JSON literal/i);
    });

    it('should throw a descriptive error when an array literal operand is malformed JSON', () => {
      expect(() => evaluateCondition('[1, 2 === 1')).toThrow(/JSON literal/i);
    });

    it('should parse valid JSON object operands', () => {
      expect(evaluateCondition('{"a":1} === {"a":1}')).toBe(false);
    });
  });
});
