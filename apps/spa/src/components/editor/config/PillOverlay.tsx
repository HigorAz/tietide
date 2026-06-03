import type { RefObject } from 'react';
import { cn } from '@/utils/cn';
import type { Segment } from '@/lib/dataPillToken';

export interface PillOverlayProps {
  segments: Segment[];
  placeholder?: string;
  showPlaceholder: boolean;
  /** Wrap text (expanded textarea) vs. keep it on one clipped line (collapsed input). */
  multiline?: boolean;
  /** Scroll-synced with the underlying field so chips stay aligned when it scrolls. */
  overlayRef?: RefObject<HTMLDivElement>;
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
  multiline = false,
  overlayRef,
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
        // overflow-hidden lets us mirror the field's scroll offset; pr-8 leaves room
        // for the expand toggle so chips never sit under it.
        'pointer-events-none absolute inset-0 z-10 overflow-hidden py-2 pl-3 pr-8 text-sm leading-6',
        multiline ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
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
          return (
            <span
              key={i}
              data-testid={isReserved ? 'data-pill-reserved' : 'data-pill-chip'}
              className={cn(
                'rounded px-1',
                isReserved
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
