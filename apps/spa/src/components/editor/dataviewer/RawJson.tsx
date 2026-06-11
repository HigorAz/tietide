import { Fragment, useMemo } from 'react';
import { tokenizeJson, type JsonTokenType } from './jsonTokens';
import { safeStringify } from './valueFormat';

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

/**
 * Cap the serialized payload the pane will tokenize+render. A multi-MB blob would
 * otherwise produce tens of thousands of spans and freeze the editor. Past the cap
 * we show a truncated view + a notice; the full payload is still available via the
 * header's "Copy JSON" button (which stringifies `value` directly, not this view).
 */
const RAW_MAX_CHARS = 50_000;

export interface RawJsonProps {
  value: unknown;
  testId?: string;
}

/** Syntax-tinted, vertically scrolling pretty-JSON pane. React spans only — no HTML injection. */
export function RawJson({ value, testId }: RawJsonProps): JSX.Element {
  // Memoize on `value` so unrelated parent re-renders (search box keystrokes,
  // sibling-section toggles) don't re-stringify + re-tokenize the whole blob (WR-01).
  const { tokens, truncated } = useMemo(() => {
    const full = safeStringify(value);
    const isTruncated = full.length > RAW_MAX_CHARS;
    const source = isTruncated ? full.slice(0, RAW_MAX_CHARS) : full;
    return { tokens: tokenizeJson(source), truncated: isTruncated };
  }, [value]);

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
      {truncated && (
        <span data-testid="raw-json-truncated" className="mt-2 block text-text-muted">
          {'\n'}… output truncated — use Copy JSON for the full payload.
        </span>
      )}
    </pre>
  );
}
