import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnsavedChangesModal } from './UnsavedChangesModal';

describe('UnsavedChangesModal', () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onDiscard: ReturnType<typeof vi.fn>;
  let onStay: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn();
    onDiscard = vi.fn();
    onStay = vi.fn();
  });

  const renderModal = (overrides: Partial<Parameters<typeof UnsavedChangesModal>[0]> = {}) =>
    render(
      <UnsavedChangesModal
        open
        onSave={onSave}
        onDiscard={onDiscard}
        onStay={onStay}
        isSaving={false}
        saveError={null}
        {...overrides}
      />,
    );

  describe('rendering', () => {
    it('should render nothing when open is false', () => {
      const { container } = render(
        <UnsavedChangesModal
          open={false}
          onSave={onSave}
          onDiscard={onDiscard}
          onStay={onStay}
          isSaving={false}
          saveError={null}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('should render the prompt and three explicit buttons when open', () => {
      renderModal();

      expect(screen.getByRole('heading', { name: /unsaved changes/i })).toBeInTheDocument();
      expect(screen.getByText(/save, discard, or stay/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^stay$/i })).toBeInTheDocument();
    });
  });

  describe('button callbacks', () => {
    it('should call onSave when Save is clicked', async () => {
      renderModal();

      await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('should call onDiscard when Discard is clicked', async () => {
      renderModal();

      await userEvent.click(screen.getByRole('button', { name: /^discard$/i }));

      expect(onDiscard).toHaveBeenCalledTimes(1);
    });

    it('should call onStay when Stay is clicked', async () => {
      renderModal();

      await userEvent.click(screen.getByRole('button', { name: /^stay$/i }));

      expect(onStay).toHaveBeenCalledTimes(1);
    });
  });

  describe('no implicit dismiss-equals-discard', () => {
    it('should call onStay (NOT onDiscard) when the backdrop is clicked', async () => {
      renderModal();

      const backdrop = screen.getByRole('dialog').parentElement!;
      await userEvent.click(backdrop);

      expect(onStay).toHaveBeenCalledTimes(1);
      expect(onDiscard).not.toHaveBeenCalled();
    });

    it('should call onStay (NOT onDiscard) when Escape is pressed', async () => {
      renderModal();

      await userEvent.keyboard('{Escape}');

      expect(onStay).toHaveBeenCalledTimes(1);
      expect(onDiscard).not.toHaveBeenCalled();
    });
  });

  describe('isSaving state', () => {
    it('should disable all three buttons while saving', () => {
      renderModal({ isSaving: true });

      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /^discard$/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /^stay$/i })).toBeDisabled();
    });
  });

  describe('saveError', () => {
    it('should render the saveError message when set', () => {
      renderModal({ saveError: 'Save failed. Please try again.' });

      expect(screen.getByText(/save failed/i)).toBeInTheDocument();
    });

    it('should not render an error message when saveError is null', () => {
      renderModal({ saveError: null });

      expect(screen.queryByText(/save failed/i)).not.toBeInTheDocument();
    });
  });
});
