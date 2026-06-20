import type { SelectionMode } from 'reactflow';

type KeyCode = string | string[];

/**
 * React Flow interaction props that differ between desktop (mouse/keyboard) and
 * touch (phone/tablet). Spread onto `<ReactFlow {...editorTouchProps(isMobile)} />`.
 *
 * Desktop enables Figma-style box selection: a left-drag on the canvas draws a
 * selection rectangle (multi-select), while panning moves to the middle mouse
 * button or Space+drag. Mobile nulls out keyboard modifiers — meaningless
 * without a keyboard — and keeps one-finger panning (no selectionOnDrag), so a
 * drag always pans. Pinch-zoom and touch panning are on by default in RF 11.
 */
export interface EditorTouchProps {
  multiSelectionKeyCode?: KeyCode | null;
  panActivationKeyCode?: KeyCode | null;
  selectionKeyCode?: KeyCode | null;
  zoomOnDoubleClick?: boolean;
  selectionOnDrag?: boolean;
  panOnDrag?: boolean | number[];
  selectionMode?: SelectionMode;
}

const MULTI_SELECT_KEYS = ['Meta', 'Control', 'Shift'];

export function editorTouchProps(isMobile: boolean): EditorTouchProps {
  if (isMobile) {
    return {
      multiSelectionKeyCode: null,
      panActivationKeyCode: null,
      selectionKeyCode: null,
      zoomOnDoubleClick: false,
    };
  }
  return {
    multiSelectionKeyCode: [...MULTI_SELECT_KEYS],
    panActivationKeyCode: 'Space',
    // Left-drag on the canvas box-selects nodes (multi-select); pan with the
    // middle mouse button or Space+drag. Partial mode selects a node when the
    // box merely touches it, not only when fully enclosed.
    selectionOnDrag: true,
    panOnDrag: [1],
    // SelectionMode.Partial — string literal avoids importing the runtime enum
    // (some test mocks of `reactflow` don't export it).
    selectionMode: 'partial' as SelectionMode,
  };
}
