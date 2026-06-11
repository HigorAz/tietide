import { describe, expect, it } from 'vitest';
import { tokenizeJson } from './jsonTokens';

describe('tokenizeJson', () => {
  const sample = '{\n  "a": "b",\n  "n": 1,\n  "ok": true,\n  "x": null\n}';

  it('classifies keys, scalars and punctuation', () => {
    const tokens = tokenizeJson(sample);
    const typeOf = (text: string): string | undefined => tokens.find((t) => t.text === text)?.type;

    expect(typeOf('"a"')).toBe('key');
    expect(typeOf('"n"')).toBe('key');
    expect(typeOf('"ok"')).toBe('key');
    expect(typeOf('"x"')).toBe('key');
    expect(typeOf('"b"')).toBe('string');
    expect(typeOf('1')).toBe('number');
    expect(typeOf('true')).toBe('boolean');
    expect(typeOf('null')).toBe('null');
    // braces / commas / colons / whitespace are punct
    const punctTexts = tokens.filter((t) => t.type === 'punct').map((t) => t.text);
    expect(punctTexts.some((t) => t.includes('{'))).toBe(true);
    expect(punctTexts.some((t) => t.includes(':'))).toBe(true);
    expect(punctTexts.some((t) => t.includes(','))).toBe(true);
  });

  it('is lossless — joined token texts reproduce the input exactly', () => {
    const tokens = tokenizeJson(sample);
    expect(tokens.map((t) => t.text).join('')).toBe(sample);
  });

  it('handles negative and floating-point numbers', () => {
    const text = '{\n  "f": -3.14,\n  "e": 2e10\n}';
    const tokens = tokenizeJson(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    expect(tokens.find((t) => t.text === '-3.14')?.type).toBe('number');
    expect(tokens.find((t) => t.text === '2e10')?.type).toBe('number');
  });

  it('does not misclassify a colon inside a string value', () => {
    const text = '{\n  "url": "http://x"\n}';
    const tokens = tokenizeJson(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    expect(tokens.find((t) => t.text === '"url"')?.type).toBe('key');
    expect(tokens.find((t) => t.text === '"http://x"')?.type).toBe('string');
  });

  it('returns a single false boolean token', () => {
    const tokens = tokenizeJson('false');
    expect(tokens).toEqual([{ type: 'boolean', text: 'false' }]);
  });
});
