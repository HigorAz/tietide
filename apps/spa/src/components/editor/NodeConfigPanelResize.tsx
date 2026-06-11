import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/utils/cn';

const PANEL_WIDTH_KEY = 'tietide.nodeConfigPanel.width';
const MIN_PANEL_WIDTH = 320; // matches the previous fixed w-80
const MAX_PANEL_WIDTH = 760;

function readStoredWidth(): number {
  if (typeof window === 'undefined') return MIN_PANEL_WIDTH;
  const raw = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return MIN_PANEL_WIDTH;
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, raw));
}

/** Drag the panel's left edge to resize its width; persists to localStorage. */
export function useResizableWidth(): {
  width: number;
  onPointerDown: (e: ReactPointerEvent) => void;
} {
  const [width, setWidth] = useState(readStoredWidth);
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      // Track the live dragged width so onUp persists the FINAL value, not the
      // pre-drag `width` captured in this memoized closure (the move listeners
      // close over the original `width`, so reading it in onUp lagged by a drag).
      let latest = startW;
      const onMove = (ev: PointerEvent): void => {
        // Panel is on the right, so dragging the left edge leftwards widens it.
        latest = Math.min(
          MAX_PANEL_WIDTH,
          Math.max(MIN_PANEL_WIDTH, startW + (startX - ev.clientX)),
        );
        setWidth(latest);
      };
      const onUp = (): void => {
        window.localStorage.setItem(PANEL_WIDTH_KEY, String(latest));
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width],
  );
  return { width, onPointerDown };
}

export function PanelResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: ReactPointerEvent) => void;
}): JSX.Element {
  return (
    <span
      role="separator"
      aria-label="Resize panel"
      aria-orientation="vertical"
      data-testid="node-config-resize"
      onPointerDown={onPointerDown}
      className={cn(
        'absolute left-0 top-0 z-20 h-full w-1.5 -translate-x-1/2 cursor-col-resize',
        'transition hover:bg-accent-teal/40',
      )}
    />
  );
}
