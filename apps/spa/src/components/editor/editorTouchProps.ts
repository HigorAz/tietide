type KeyCode = string | string[];

/**
 * React Flow interaction props that differ between desktop (mouse/keyboard) and
 * touch (phone/tablet). Spread onto `<ReactFlow {...editorTouchProps(isMobile)} />`.
 *
 * Desktop returns only what the editor already set, leaving every other prop
 * `undefined` so React Flow's defaults stand unchanged (byte-for-byte desktop
 * behavior). Mobile nulls out keyboard modifiers — meaningless without a
 * keyboard — so a one-finger pane drag always pans, and disables double-tap
 * zoom to avoid accidental zooming. Pinch-zoom and touch panning are on by
 * default in React Flow 11, so they need no explicit prop.
 */
export interface EditorTouchProps {
  multiSelectionKeyCode?: KeyCode | null;
  panActivationKeyCode?: KeyCode | null;
  selectionKeyCode?: KeyCode | null;
  zoomOnDoubleClick?: boolean;
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
  };
}
