import type { JSX } from 'react';
import { Modal } from '@/components/dashboard/Modal';
import { JsonTree } from '@/components/editor/dataviewer/JsonTree';
import { cn } from '@/utils/cn';

export interface SampleDiffModalProps {
  /** The node's current sample (left / "before"). */
  previous: unknown;
  /** The freshly captured sample (right / "after"). */
  next: unknown;
  /** Keep the existing sample — configured data pills are preserved. */
  onKeep: () => void;
  /** Replace with the captured sample. */
  onReplace: () => void;
}

const PANE_CLASS = cn(
  'flex-1 min-w-0 max-h-[320px] overflow-auto rounded-md border border-white/10 bg-deep-blue/40 p-2',
);

/**
 * Before/after comparison shown when a node test or trigger fetch captures a
 * sample that differs from the one already stored (#3). Lets the user keep the
 * existing sample (preserving configured data pills) or replace it — instead of
 * the previous behavior that silently overwrote on every run.
 */
export function SampleDiffModal({
  previous,
  next,
  onKeep,
  onReplace,
}: SampleDiffModalProps): JSX.Element {
  return (
    <Modal onClose={onKeep} ariaLabel="Review output sample change" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-text-primary">Output sample changed</h2>
          <p className="text-xs text-text-muted">
            This node already has a captured sample. Replacing it may break data pills that
            reference fields the new sample doesn’t have. Keep the current sample, or replace it.
          </p>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Current
            </span>
            <div className={PANE_CLASS}>
              <JsonTree value={previous} testId="sample-diff-previous" />
            </div>
          </div>
          <div className="flex flex-1 min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-accent-teal">
              New
            </span>
            <div className={cn(PANE_CLASS, 'border-accent-teal/40')}>
              <JsonTree value={next} testId="sample-diff-next" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="sample-diff-keep"
            onClick={onKeep}
            className={cn(
              'rounded-md border border-white/10 bg-elevated px-3 py-2 text-xs font-semibold',
              'text-text-secondary hover:text-text-primary hover:border-accent-teal',
              'focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            Keep current
          </button>
          <button
            type="button"
            data-testid="sample-diff-replace"
            onClick={onReplace}
            className={cn(
              'rounded-md bg-accent-teal px-3 py-2 text-xs font-semibold text-deep-blue',
              'hover:bg-accent-teal/90 focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            Replace
          </button>
        </div>
      </div>
    </Modal>
  );
}
