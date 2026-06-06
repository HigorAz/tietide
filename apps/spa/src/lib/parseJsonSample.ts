// Tolerant JSON parser for user-pasted "output sample" snippets. Plain
// `JSON.parse` rejects input that looks valid to a human but carries characters
// a rich-text source (chat, docs, editors) silently injects: curly/smart quotes,
// non-breaking spaces, and zero-width/BOM characters. We normalize those to
// their ASCII equivalents before parsing so a pasted `{ "id": 1 }` resolves the
// way the user expects. Used by the Code/HTTP "Output sample" field and by the
// data-pill picker so both agree on what a valid sample is.
//
// Char codes (not literal glyphs) keep this source ASCII-only so the bundler
// never trips over invisible characters.

export type ParseJsonSampleResult = { ok: true; value: unknown } | { ok: false; error: string };

const charClass = (codes: number[]): RegExp =>
  new RegExp('[' + codes.map((c) => '\\u' + c.toString(16).padStart(4, '0')).join('') + ']', 'g');

// Smart double quotes (U+201C/D/E/F) + double prime (U+2033) -> ".
const SMART_DOUBLE_QUOTES = charClass([0x201c, 0x201d, 0x201e, 0x201f, 0x2033]);
// Smart single quotes (U+2018/19/1A/1B) + prime (U+2032) -> '.
const SMART_SINGLE_QUOTES = charClass([0x2018, 0x2019, 0x201a, 0x201b, 0x2032]);
// Non-breaking / unusual spaces (nbsp, en/em range, narrow, ideographic) -> space.
const EXOTIC_SPACES = charClass([
  0x00a0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x202f, 0x205f, 0x3000,
]);
// BOM + zero-width characters that carry no meaning inside JSON.
const ZERO_WIDTH = charClass([0xfeff, 0x200b, 0x200c, 0x200d, 0x2060]);

/** Normalize human-pasted text into something `JSON.parse` can accept. */
export function normalizeJsonSample(text: string): string {
  return text
    .replace(ZERO_WIDTH, '')
    .replace(EXOTIC_SPACES, ' ')
    .replace(SMART_DOUBLE_QUOTES, '"')
    .replace(SMART_SINGLE_QUOTES, "'");
}

/**
 * Parse a user-pasted JSON sample, tolerating smart quotes and exotic
 * whitespace. Empty/whitespace-only input is treated as "no sample"
 * (`{ ok: true, value: undefined }`) so callers can clear the stored sample.
 */
export function parseJsonSample(text: string): ParseJsonSampleResult {
  const trimmed = normalizeJsonSample(text).trim();
  if (trimmed === '') return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false, error: 'Output sample is not valid JSON.' };
  }
}
