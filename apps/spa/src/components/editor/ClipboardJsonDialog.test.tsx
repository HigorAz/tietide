import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClipboardJsonDialog } from './ClipboardJsonDialog';

describe('ClipboardJsonDialog', () => {
  describe('open=false', () => {
    it('should not render anything', () => {
      const { container } = render(
        <ClipboardJsonDialog
          open={false}
          mode="copy"
          jsonForCopy="{}"
          onClose={vi.fn()}
          onPaste={vi.fn()}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('copy mode', () => {
    it('should render the JSON in a read-only textarea', () => {
      render(
        <ClipboardJsonDialog
          open
          mode="copy"
          jsonForCopy='{"tietideClipboard":1,"nodes":[],"edges":[]}'
          onClose={vi.fn()}
          onPaste={vi.fn()}
        />,
      );
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toContain('"tietideClipboard":1');
      expect(textarea.readOnly).toBe(true);
    });

    it('should call onClose when the Close button is clicked', () => {
      const onClose = vi.fn();
      render(
        <ClipboardJsonDialog
          open
          mode="copy"
          jsonForCopy="{}"
          onClose={onClose}
          onPaste={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('paste mode', () => {
    it('should call onPaste with the textarea content and close on success', () => {
      const onClose = vi.fn();
      const onPaste = vi.fn().mockReturnValue(undefined); // success returns void
      render(
        <ClipboardJsonDialog
          open
          mode="paste"
          jsonForCopy=""
          onClose={onClose}
          onPaste={onPaste}
        />,
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: { value: '{"tietideClipboard":1,"nodes":[],"edges":[]}' },
      });
      fireEvent.click(screen.getByRole('button', { name: /paste & insert/i }));

      expect(onPaste).toHaveBeenCalledWith('{"tietideClipboard":1,"nodes":[],"edges":[]}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should display the error returned by onPaste and stay open on invalid JSON', () => {
      const onClose = vi.fn();
      const onPaste = vi.fn().mockReturnValue('Clipboard does not contain valid TieTide nodes');
      render(
        <ClipboardJsonDialog
          open
          mode="paste"
          jsonForCopy=""
          onClose={onClose}
          onPaste={onPaste}
        />,
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'not json' } });
      fireEvent.click(screen.getByRole('button', { name: /paste & insert/i }));

      expect(onPaste).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Clipboard does not contain valid TieTide nodes/i),
      ).toBeInTheDocument();
    });

    it('should disable the Paste & Insert button while the textarea is empty', () => {
      render(
        <ClipboardJsonDialog
          open
          mode="paste"
          jsonForCopy=""
          onClose={vi.fn()}
          onPaste={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /paste & insert/i })).toBeDisabled();
    });
  });

  describe('Escape key', () => {
    it('should call onClose when Escape is pressed', () => {
      const onClose = vi.fn();
      render(
        <ClipboardJsonDialog
          open
          mode="copy"
          jsonForCopy="{}"
          onClose={onClose}
          onPaste={vi.fn()}
        />,
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
