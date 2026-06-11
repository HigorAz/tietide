import { Fragment, useMemo, type JSX } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useCopy } from '@/components/editor/dataviewer/useCopy';
import { findTemplatePaths, deriveHint } from './errorText';

export interface ErrorCardProps {
  error: { message: string; code: string | null };
  onFixInConfigure?: () => void;
  testId?: string;
}

/**
 * Build the message body as React nodes: literal slices as text and detected
 * template paths wrapped in <mark> elements. Highlight is built purely from
 * React nodes (no raw-HTML injection sink) because worker error messages may
 * echo attacker-controlled payload fragments — T-01-03.
 */
function renderMessage(message: string): JSX.Element[] {
  const spans = findTemplatePaths(message);
  const out: JSX.Element[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.start > cursor) {
      out.push(<Fragment key={`lit-${i}`}>{message.slice(cursor, span.start)}</Fragment>);
    }
    out.push(
      <mark
        key={`mark-${i}`}
        data-testid="error-highlight"
        className="rounded bg-status-failed/25 px-0.5 text-status-failed"
      >
        {span.text}
      </mark>,
    );
    cursor = span.end;
  });
  if (cursor < message.length) {
    out.push(<Fragment key="lit-tail">{message.slice(cursor)}</Fragment>);
  }
  return out;
}

/**
 * Structured error card for a failed node run: red-tinted header with the error
 * code, a mono message block with the failing pill path highlighted, a
 * plain-language hint when derivable, and Fix in Configure + Copy error actions.
 * Replaces the raw NodeRunError <pre> in InspectorRunPanel (locked sketch 002-D).
 */
export function ErrorCard({
  error,
  onFixInConfigure,
  testId = 'error-card',
}: ErrorCardProps): JSX.Element {
  const copy = useCopy();
  const hint = useMemo(() => deriveHint(error.message), [error.message]);
  const copyText = useMemo(
    () => (error.code ? `${error.message}\n[${error.code}]` : error.message),
    [error.message, error.code],
  );

  return (
    <div
      data-testid={testId}
      className="rounded border border-status-failed/30 bg-status-failed/10"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-status-failed">
          <AlertTriangle size={14} className="text-status-failed" />
          Node failed
        </span>
        {error.code && (
          <span className="text-[10px] uppercase tracking-wide text-status-failed/80">
            {error.code}
          </span>
        )}
      </div>

      <pre className="m-3 mt-0 whitespace-pre-wrap break-words rounded bg-deep-blue/40 p-2 font-mono text-[11.5px] leading-snug text-text-primary select-text">
        {renderMessage(error.message)}
      </pre>

      {hint && (
        <p className="px-3 pb-2 text-[11px] leading-snug text-text-secondary">
          <span className="font-medium text-text-primary">Hint:</span> {hint}
        </p>
      )}

      <div className="flex items-center gap-2 px-3 pb-3">
        {onFixInConfigure && (
          <button
            type="button"
            onClick={onFixInConfigure}
            className="rounded bg-accent-teal/15 px-2 py-1 text-xs font-medium text-accent-teal transition hover:bg-accent-teal/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
          >
            Fix in Configure
          </button>
        )}
        <button
          type="button"
          onClick={() => void copy(copyText, 'error')}
          className="rounded px-2 py-1 text-xs text-text-secondary transition hover:bg-white/5 hover:text-text-primary"
        >
          Copy error
        </button>
      </div>
    </div>
  );
}
