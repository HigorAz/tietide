import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

    it('should style a warning toast with the warning tone token', () => {
      render(<Toaster />);

      act(() => {
        useToastStore.getState().show({
          tone: 'warning',
          message: 'Heads up',
          durationMs: 0,
        });
      });

      const toast = screen.getByRole('status');
      expect(toast.className).toMatch(/warning/);
    });
  });

  describe('action link', () => {
    it('should render a link to the action href when toast.action is set', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Toaster />
        </MemoryRouter>,
      );

      act(() => {
        useToastStore.getState().show({
          tone: 'success',
          message: 'Run started',
          durationMs: 0,
          action: { label: 'View execution', href: '/executions/exec-1' },
        });
      });

      const link = screen.getByRole('link', { name: /view execution/i });
      expect(link).toHaveAttribute('href', '/executions/exec-1');
    });

    it('should dismiss the toast and navigate when the action link is clicked', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/']}>
          <Toaster />
          <Routes>
            <Route path="/" element={<div data-testid="root">root</div>} />
            <Route path="/executions/:id" element={<div data-testid="exec">exec</div>} />
          </Routes>
        </MemoryRouter>,
      );

      act(() => {
        useToastStore.getState().show({
          tone: 'success',
          message: 'Run started',
          durationMs: 0,
          action: { label: 'View execution', href: '/executions/exec-2' },
        });
      });

      await user.click(screen.getByRole('link', { name: /view execution/i }));

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByTestId('exec')).toBeInTheDocument();
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
