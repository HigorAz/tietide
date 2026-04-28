import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { Toaster } from './Toaster';

describe('Toaster', () => {
  beforeEach(() => {
    useToastStore.setState({ ...initialToastState });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('should render nothing when there are no toasts', () => {
      render(<Toaster />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('should render a toast pushed onto the store', () => {
      render(<Toaster />);

      act(() => {
        useToastStore.getState().show({ tone: 'success', message: 'Workflow saved' });
      });

      expect(screen.getByRole('status')).toHaveTextContent('Workflow saved');
    });

    it('should expose a region landmark for screen readers', () => {
      render(<Toaster />);

      expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument();
    });

    it('should style success and error toasts differently via tone', () => {
      render(<Toaster />);

      act(() => {
        useToastStore.getState().show({
          tone: 'error',
          message: 'Failed to save',
          durationMs: 0,
        });
      });

      const toast = screen.getByRole('status');
      expect(toast.className).toMatch(/error/);
    });
  });

  describe('dismiss', () => {
    it('should remove a toast when its close button is clicked', async () => {
      const user = userEvent.setup();
      render(<Toaster />);

      act(() => {
        useToastStore.getState().show({ tone: 'info', message: 'Heads up', durationMs: 0 });
      });
      expect(screen.getByRole('status')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});
