import type { InteractionMode } from '@/stores/editorStore';

type KeyCode = string | string[];

/**
 * React Flow interaction props that differ between desktop (mouse/keyboard) and
 * touch (phone/tablet), and — on desktop — between the pan and select
 * interaction modes. Spread onto `<ReactFlow {...editorTouchProps(isMobile, mode)} />`.
 *
 * Desktop **pan mode** (default) keeps the conventional left-drag-to-pan
 * (matching n8n/Make/Figma) and box-selects when Shift **or** Alt is held.
 * Desktop **select mode** flips it Figma-style: left-drag draws a selection
 * box, the middle mouse button (or Space+drag) pans, and right-click is left
 * free for the context menu. Mobile nulls out keyboard modifiers — meaningless
 * without a keyboard — so a one-finger drag always pans. Pinch-zoom and touch
 * panning are on by default in RF 11.
 */
export interface EditorTouchProps {
  multiSelectionKeyCode?: KeyCode | null;
  panActivationKeyCode?: KeyCode | null;
  selectionKeyCode?: KeyCode | null;
  panOnDrag?: boolean | number[];
  selectionOnDrag?: boolean;
  zoomOnDoubleClick?: boolean;
}

const MULTI_SELECT_KEYS = ['Meta', 'Control', 'Shift'];
// Explicit box-select modifier — hold Shift OR Alt and drag. (Previously this
// relied on React Flow's implicit default of 'Shift'.)
const SELECTION_KEYS = ['Shift', 'Alt'];

export function editorTouchProps(
  isMobile: boolean,
  mode: InteractionMode = 'pan',
): EditorTouchProps {
  if (isMobile) {
    return {
      multiSelectionKeyCode: null,
      panActivationKeyCode: null,
      selectionKeyCode: null,
      zoomOnDoubleClick: false,
    };
  }
  if (mode === 'select') {
    // Left-drag draws a selection box; the middle mouse button (index 1) or
    // Space+drag pans. Right-mouse (index 2) is deliberately omitted so the
    // canvas context menu still opens.
    return {
      multiSelectionKeyCode: [...MULTI_SELECT_KEYS],
      selectionKeyCode: [...SELECTION_KEYS],
      panActivationKeyCode: 'Space',
      panOnDrag: [1],
      selectionOnDrag: true,
    };
  }
  // Pan mode (default): left-drag pans; hold Shift/Alt and drag to box-select.
  return {
    multiSelectionKeyCode: [...MULTI_SELECT_KEYS],
    panActivationKeyCode: 'Space',
    selectionKeyCode: [...SELECTION_KEYS],
  };
}
