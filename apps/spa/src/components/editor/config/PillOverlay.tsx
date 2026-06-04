import type { RefObject } from 'react';
import { cn } from '@/utils/cn';
import type { Segment } from '@/lib/dataPillToken';

export interface PillOverlayProps {
  segments: Segment[];
  placeholder?: string;
  showPlaceholder: boolean;
  /** Scroll-synced with the underlying field so chips stay aligned when it scrolls. */
  overlayRef?: RefObject<HTMLDivElement>;
  /** Full `{{…}}` tokens that reference a missing/invalid node — rendered red. */
  invalidTokens?: Set<string>;
}

/**
 * Syntax-highlighted overlay painted on top of the underlying (text-transparent) input so
 * `{{ data pills }}` and reserved `{{ ENV_VARS }}` render as colored chips while the user
 * keeps editing plain text underneath. Extracted from DataPillInput to keep it under budget.
 */
export function PillOverlay({
  segments,
  placeholder,
  showPlaceholder,
  overlayRef,
  invalidTokens,
}: PillOverlayProps) {
  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      data-testid="data-pill-overlay"
      className={cn(
        // z-10 lifts the overlay above the input, which paints its own bg-elevated
        // background. Without it the input's bg covered the overlay and the text was
        // invisible unless selected (selection highlight paints on top regardless).
        // overflow-hidden lets us mirror the field's scroll offset. The text wraps
        // exactly like the underlying textarea — including breaking long unbroken
        // strings ([overflow-wrap:anywhere]) so nothing spills past the box edge.
        'pointer-events-none absolute inset-0 z-10 overflow-hidden px-3 py-2 text-sm leading-6',
        'whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
      )}
    >
      {showPlaceholder && placeholder ? (
        <span className="text-text-muted">{placeholder}</span>
      ) : (
        segments.map((seg, i) => {
          if (seg.kind === 'literal') {
            return (
              <span key={i} className="text-text-primary">
                {seg.text}
              </span>
            );
          }
          const isReserved = seg.kind === 'reserved';
          const isInvalid = !isReserved && invalidTokens?.has(seg.text) === true;
          return (
            <span
              key={i}
              data-testid={
                isInvalid
                  ? 'data-pill-invalid'
                  : isReserved
                    ? 'data-pill-reserved'
                    : 'data-pill-chip'
              }
              className={cn(
                'rounded px-1',
                isInvalid
                  ? 'bg-red-500/15 text-red-400 underline decoration-wavy'
                  : isReserved
                    ? 'bg-amber-400/15 text-amber-300'
                    : 'bg-accent-teal/15 text-accent-teal',
              )}
            >
              {seg.text}
            </span>
          );
        })
      )}
    </div>
  );
}
