type KeyCode = string | string[];

/**
 * React Flow interaction props that differ between desktop (mouse/keyboard) and
 * touch (phone/tablet). Spread onto `<ReactFlow {...editorTouchProps(isMobile)} />`.
 *
 * Desktop keeps the conventional left-drag-to-pan (matching n8n/Make/Figma's
 * default) and adds modifier-driven multi-select: Cmd/Ctrl/Shift+click toggles
 * a node into the selection, and Shift+drag on the canvas draws a selection box
 * (React Flow's default `selectionKeyCode`). Mobile nulls out keyboard
 * modifiers — meaningless without a keyboard — so a one-finger drag always pans.
 * Pinch-zoom and touch panning are on by default in RF 11.
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
  // Multi-select via Cmd/Ctrl/Shift+click; box-select via Shift+drag (RF default
  // selectionKeyCode). Left-drag still pans, so the dominant builder convention
  // and trackpad users are unaffected.
  return {
    multiSelectionKeyCode: [...MULTI_SELECT_KEYS],
    panActivationKeyCode: 'Space',
  };
}
