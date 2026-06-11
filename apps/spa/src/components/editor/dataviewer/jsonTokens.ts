// Pure, lossless tokenizer for pretty-printed JSON text. Drives RawJson's syntax
// tinting: it emits a flat token stream where concatenating every `text` field
// reproduces the input byte-for-byte (whitespace/punctuation captured as 'punct'),
// so the raw pane can colour each span without ever touching dangerouslySetInnerHTML.

export type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct';

export interface JsonToken {
  type: JsonTokenType;
  text: string;
}

/**
 * Matches the four "interesting" lexemes:
 *  1. a double-quoted string, optionally followed by a colon (a key)
 *  2. a number (int / float / exponent, optional sign)
 *  3. a boolean keyword
 *  4. the null keyword
 * Everything between matches (braces, commas, colons, whitespace) is 'punct'.
 */
const TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;

export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let lastIndex = 0;

  const pushPunct = (slice: string): void => {
    if (slice.length > 0) tokens.push({ type: 'punct', text: slice });
  };

  for (let match = TOKEN_RE.exec(text); match !== null; match = TOKEN_RE.exec(text)) {
    const [whole, quoted, colon, num, bool, nul] = match;
    // Emit any gap before this match as punctuation (preserves whitespace exactly).
    pushPunct(text.slice(lastIndex, match.index));

    if (quoted !== undefined) {
      // A quoted string trailed by a colon is an object key; the colon itself is punct.
      tokens.push({ type: colon !== undefined ? 'key' : 'string', text: quoted });
      if (colon !== undefined) pushPunct(colon);
    } else if (num !== undefined) {
      tokens.push({ type: 'number', text: num });
    } else if (bool !== undefined) {
      tokens.push({ type: 'boolean', text: bool });
    } else if (nul !== undefined) {
      tokens.push({ type: 'null', text: nul });
    }

    lastIndex = match.index + whole.length;
  }

  // Trailing punctuation after the final match.
  pushPunct(text.slice(lastIndex));
  return tokens;
}
