import { describe, it, expect } from 'vitest';
import { editorTouchProps } from './editorTouchProps';

describe('editorTouchProps', () => {
  describe('desktop (isMobile = false)', () => {
    const props = editorTouchProps(false);

    it('keeps the cross-platform multi-selection keys', () => {
      expect(props.multiSelectionKeyCode).toEqual(['Meta', 'Control', 'Shift']);
    });

    it('keeps Space as the pan-activation key', () => {
      expect(props.panActivationKeyCode).toBe('Space');
    });

    it('does not override selection or double-click zoom (lets React Flow defaults stand)', () => {
      expect(props.selectionKeyCode).toBeUndefined();
      expect(props.zoomOnDoubleClick).toBeUndefined();
    });

    it('enables Figma-style box-selection with panning on the middle mouse button', () => {
      expect(props.selectionOnDrag).toBe(true);
      expect(props.panOnDrag).toEqual([1]);
      expect(props.selectionMode).toBeDefined();
    });
  });

  describe('mobile (isMobile = true)', () => {
    const props = editorTouchProps(true);

    it('disables keyboard-driven selection/pan modifiers (no keyboard on touch)', () => {
      expect(props.multiSelectionKeyCode).toBeNull();
      expect(props.panActivationKeyCode).toBeNull();
      expect(props.selectionKeyCode).toBeNull();
    });

    it('disables double-click zoom to avoid accidental double-tap zoom', () => {
      expect(props.zoomOnDoubleClick).toBe(false);
    });

    it('does not enable box-selection on touch (one-finger drag pans)', () => {
      expect(props.selectionOnDrag).toBeUndefined();
      expect(props.panOnDrag).toBeUndefined();
    });
  });
});
