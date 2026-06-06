import { describe, expect, it } from 'vitest';
import { normalizeJsonSample, parseJsonSample } from './parseJsonSample';

// Build special characters from char codes so this test source stays ASCII-only.
const LDQUO = String.fromCharCode(0x201c); // “
const RDQUO = String.fromCharCode(0x201d); // ”
const NBSP = String.fromCharCode(0x00a0); // non-breaking space
const ZWSP = String.fromCharCode(0x200b); // zero-width space
const BOM = String.fromCharCode(0xfeff); // byte-order mark

describe('parseJsonSample', () => {
  it('parses clean JSON', () => {
    expect(parseJsonSample('{"id": 1, "text": "test"}')).toEqual({
      ok: true,
      value: { id: 1, text: 'test' },
    });
  });

  it('parses multi-line JSON with surrounding whitespace', () => {
    expect(parseJsonSample('\n  {\n  "id": 1,\n  "text": "test"\n}\n  ')).toEqual({
      ok: true,
      value: { id: 1, text: 'test' },
    });
  });

  it('treats empty / whitespace-only input as no sample', () => {
    expect(parseJsonSample('')).toEqual({ ok: true, value: undefined });
    expect(parseJsonSample('   \n ')).toEqual({ ok: true, value: undefined });
  });

  it('tolerates smart/curly double quotes from pasted text', () => {
    const pasted = `{ ${LDQUO}id${RDQUO}: 1, ${LDQUO}text${RDQUO}: ${LDQUO}test${RDQUO} }`;
    expect(parseJsonSample(pasted)).toEqual({ ok: true, value: { id: 1, text: 'test' } });
  });

  it('tolerates non-breaking spaces and zero-width characters', () => {
    const pasted = `${BOM}{ "id":${NBSP}1,${ZWSP} "ok": true }`;
    expect(parseJsonSample(pasted)).toEqual({ ok: true, value: { id: 1, ok: true } });
  });

  it('parses JSON arrays', () => {
    expect(parseJsonSample('[1, 2, 3]')).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('reports an error for genuinely invalid JSON', () => {
    expect(parseJsonSample('{ not json')).toEqual({
      ok: false,
      error: 'Output sample is not valid JSON.',
    });
  });

  it('normalizeJsonSample replaces smart quotes', () => {
    expect(normalizeJsonSample(`${LDQUO}hi${RDQUO} there`)).toBe('"hi" there');
  });
});
