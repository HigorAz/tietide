import { describe, it, expect } from 'vitest';
import { editorTouchProps } from './editorTouchProps';

describe('editorTouchProps', () => {
  describe('desktop pan mode (default)', () => {
    const props = editorTouchProps(false);

    it('keeps the cross-platform multi-selection keys', () => {
      expect(props.multiSelectionKeyCode).toEqual(['Meta', 'Control', 'Shift']);
    });

    it('keeps Space as the pan-activation key', () => {
      expect(props.panActivationKeyCode).toBe('Space');
    });

    it('makes the box-select modifier explicit (Shift or Alt + drag)', () => {
      expect(props.selectionKeyCode).toEqual(['Shift', 'Alt']);
    });

    it('keeps left-drag panning (no selectionOnDrag / panOnDrag override)', () => {
      expect(props).not.toHaveProperty('selectionOnDrag');
      expect(props).not.toHaveProperty('panOnDrag');
    });
  });

  describe('desktop select mode', () => {
    const props = editorTouchProps(false, 'select');

    it('draws a selection box on left-drag', () => {
      expect(props.selectionOnDrag).toBe(true);
    });

    it('pans with the middle mouse button only (leaves right-click for the context menu)', () => {
      expect(props.panOnDrag).toEqual([1]);
    });

    it('still allows Space-drag panning and the explicit box-select keys', () => {
      expect(props.panActivationKeyCode).toBe('Space');
      expect(props.selectionKeyCode).toEqual(['Shift', 'Alt']);
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
  });
});
