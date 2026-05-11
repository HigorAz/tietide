import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EditorContextMenu } from './EditorContextMenu';

const noop = (): void => undefined;

const renderMenu = (overrides: Partial<React.ComponentProps<typeof EditorContextMenu>> = {}) => {
  const props: React.ComponentProps<typeof EditorContextMenu> = {
    open: true,
    x: 100,
    y: 100,
    canCopy: true,
    canDelete: true,
    onClose: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onCopyAsJson: vi.fn(),
    onPasteFromJson: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const utils = render(<EditorContextMenu {...props} />);
  return { ...utils, props };
};

describe('EditorContextMenu', () => {
  describe('rendering', () => {
    it('should render five items: Copy, Paste, Copy as JSON, Paste from JSON, Delete', () => {
      renderMenu();
      expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy as JSON' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Paste from JSON' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    });

    it('should disable Delete when canDelete is false', () => {
      renderMenu({ canDelete: false });
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
    });

    it('should render nothing when open is false', () => {
      const { container } = renderMenu({ open: false });
      expect(container.firstChild).toBeNull();
    });

    it('should disable Copy and Copy as JSON when canCopy is false', () => {
      renderMenu({ canCopy: false });
      expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeDisabled();
      expect(screen.getByRole('menuitem', { name: 'Copy as JSON' })).toBeDisabled();
      expect(screen.getByRole('menuitem', { name: 'Paste' })).not.toBeDisabled();
      expect(screen.getByRole('menuitem', { name: 'Paste from JSON' })).not.toBeDisabled();
    });
  });

  describe('actions', () => {
    it('should call onCopy and then onClose when the Copy item is clicked', () => {
      const onCopy = vi.fn();
      const onClose = vi.fn();
      renderMenu({ onCopy, onClose });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));

      expect(onCopy).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onPaste and then onClose when the Paste item is clicked', () => {
      const onPaste = vi.fn();
      const onClose = vi.fn();
      renderMenu({ onPaste, onClose });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }));

      expect(onPaste).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onCopyAsJson when Copy as JSON is clicked', () => {
      const onCopyAsJson = vi.fn();
      renderMenu({ onCopyAsJson });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy as JSON' }));

      expect(onCopyAsJson).toHaveBeenCalledTimes(1);
    });

    it('should call onPasteFromJson when Paste from JSON is clicked', () => {
      const onPasteFromJson = vi.fn();
      renderMenu({ onPasteFromJson });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Paste from JSON' }));

      expect(onPasteFromJson).toHaveBeenCalledTimes(1);
    });

    it('should not call onCopy when the disabled Copy item is clicked', () => {
      const onCopy = vi.fn();
      renderMenu({ canCopy: false, onCopy });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));

      expect(onCopy).not.toHaveBeenCalled();
    });

    it('should call onDelete and then onClose when the Delete item is clicked', () => {
      const onDelete = vi.fn();
      const onClose = vi.fn();
      renderMenu({ onDelete, onClose });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onDelete when the disabled Delete item is clicked', () => {
      const onDelete = vi.fn();
      renderMenu({ canDelete: false, onDelete });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe('dismissal', () => {
    it('should call onClose when Escape is pressed', () => {
      const onClose = vi.fn();
      renderMenu({ onClose });

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when an outside click occurs', () => {
      const onClose = vi.fn();
      render(
        <>
          <EditorContextMenu
            open
            x={0}
            y={0}
            canCopy
            canDelete
            onClose={onClose}
            onCopy={noop}
            onPaste={noop}
            onCopyAsJson={noop}
            onPasteFromJson={noop}
            onDelete={noop}
          />
          <div data-testid="outside" />
        </>,
      );

      fireEvent.mouseDown(screen.getByTestId('outside'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should NOT call onClose when an inside click occurs', () => {
      const onClose = vi.fn();
      renderMenu({ onClose });

      // mousedown on the menu itself should not dismiss
      const menu = screen.getByRole('menu');
      fireEvent.mouseDown(menu);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('positioning', () => {
    it('should anchor the menu near the supplied (x, y) coordinates', () => {
      renderMenu({ x: 250, y: 320 });
      const menu = screen.getByRole('menu') as HTMLElement;
      expect(menu.style.left).toBe('250px');
      expect(menu.style.top).toBe('320px');
    });
  });
});
