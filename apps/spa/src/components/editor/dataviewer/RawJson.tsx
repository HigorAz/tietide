import { Fragment } from 'react';
import { tokenizeJson, type JsonTokenType } from './jsonTokens';

/** Token → Tailwind tint. 'key' and the scalar kinds map to the data-* tokens; */
/** 'punct' (braces, commas, colons, whitespace) gets the muted secondary text. */
const TOKEN_CLASS: Record<JsonTokenType, string> = {
  key: 'text-data-key',
  string: 'text-data-string',
  number: 'text-data-number',
  boolean: 'text-data-boolean',
  null: 'text-data-null',
  punct: 'text-text-secondary',
};

/** Pretty-print, degrading undefined/circular values to a plain string (JsonBlock parity). */
function stringify(value: unknown): string {
  if (value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export interface RawJsonProps {
  value: unknown;
  testId?: string;
}

/** Syntax-tinted, vertically scrolling pretty-JSON pane. React spans only — no HTML injection. */
export function RawJson({ value, testId }: RawJsonProps): JSX.Element {
  const tokens = tokenizeJson(stringify(value));
  return (
    <pre
      data-testid={testId}
      className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded bg-deep-blue/40 p-2 font-mono text-[11.5px] leading-snug"
    >
      {tokens.map((token, i) => (
        <Fragment key={i}>
          {token.type === 'punct' ? (
            token.text
          ) : (
            <span className={TOKEN_CLASS[token.type]}>{token.text}</span>
          )}
        </Fragment>
      ))}
    </pre>
  );
}
