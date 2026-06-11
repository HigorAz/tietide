import type { PointerEvent as ReactPointerEvent } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useResizableWidth } from './NodeConfigPanelResize';

const PANEL_WIDTH_KEY = 'tietide.nodeConfigPanel.width';

/** Minimal PointerEvent-like payload the hook reads (`clientX`, `preventDefault`). */
const pointer = (clientX: number): { clientX: number; preventDefault: () => void } => ({
  clientX,
  preventDefault: () => {},
});

const fireWindow = (type: 'pointermove' | 'pointerup', clientX: number): void => {
  window.dispatchEvent(new MouseEvent(type, { clientX }));
};

describe('useResizableWidth', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists the FINAL dragged width to localStorage, not the pre-drag width (WR-02)', () => {
    // Start at the minimum (320). Drag the left edge leftwards by 200px → +200 width.
    const { result } = renderHook(() => useResizableWidth());
    expect(result.current.width).toBe(320);

    act(() => {
      // Cast: the hook only touches `clientX` + `preventDefault` from the event.
      result.current.onPointerDown(pointer(500) as unknown as ReactPointerEvent);
    });

    // Drag leftwards: clientX 500 → 300 widens by (500 - 300) = 200 → 520.
    act(() => {
      fireWindow('pointermove', 300);
    });
    expect(result.current.width).toBe(520);

    // Release.
    act(() => {
      fireWindow('pointerup', 300);
    });

    // The persisted value must equal the final dragged width (520), not 320.
    expect(window.localStorage.getItem(PANEL_WIDTH_KEY)).toBe('520');
  });

  it('persists the last move position across multiple move events', () => {
    const { result } = renderHook(() => useResizableWidth());

    act(() => {
      result.current.onPointerDown(pointer(600) as unknown as ReactPointerEvent);
    });
    act(() => {
      fireWindow('pointermove', 500); // +100 → 420
    });
    act(() => {
      fireWindow('pointermove', 450); // +150 → 470
    });
    act(() => {
      fireWindow('pointerup', 450);
    });

    expect(result.current.width).toBe(470);
    expect(window.localStorage.getItem(PANEL_WIDTH_KEY)).toBe('470');
  });

  it('clamps the persisted width to the max bound', () => {
    const { result } = renderHook(() => useResizableWidth());

    act(() => {
      result.current.onPointerDown(pointer(2000) as unknown as ReactPointerEvent);
    });
    act(() => {
      fireWindow('pointermove', 0); // huge widen → clamps to MAX (760)
    });
    act(() => {
      fireWindow('pointerup', 0);
    });

    expect(result.current.width).toBe(760);
    expect(window.localStorage.getItem(PANEL_WIDTH_KEY)).toBe('760');
  });
});
