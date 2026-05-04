import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialExecutionLiveState, useExecutionLiveStore } from '@/stores/executionLiveStore';

vi.mock('reactflow', () => ({
  __esModule: true,
  MiniMap: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="reactflow-minimap-stub">{children}</div>
  ),
}));

import { InspectorDock, INSPECTOR_DOCK_STORAGE_KEY } from './InspectorDock';

describe('InspectorDock', () => {
  beforeEach(() => {
    localStorage.clear();
    useExecutionLiveStore.setState({ ...initialExecutionLiveState });
  });

  describe('rendering', () => {
    it('should render three tabs labelled Overview, Run, Logs', () => {
      render(<InspectorDock />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
      expect(tabs[0]).toHaveAccessibleName(/overview/i);
      expect(tabs[1]).toHaveAccessibleName(/run/i);
      expect(tabs[2]).toHaveAccessibleName(/logs/i);
    });

    it('should default to the Overview tab and render the React Flow MiniMap inside it', () => {
      render(<InspectorDock />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('reactflow-minimap-stub')).toBeInTheDocument();
    });

    it('should show the "No run yet" empty state in Run and Logs tabs while status is idle', async () => {
      const user = userEvent.setup();
      render(<InspectorDock />);

      await user.click(screen.getByRole('tab', { name: /run/i }));
      expect(screen.getByText(/no run yet/i)).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByText(/no run yet/i)).toBeInTheDocument();
    });
  });

  describe('tab interaction', () => {
    it('should switch the active tab when a trigger is clicked', async () => {
      const user = userEvent.setup();
      render(<InspectorDock />);

      const runTab = screen.getByRole('tab', { name: /run/i });
      await user.click(runTab);

      expect(runTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('collapse persistence', () => {
    it('should default to expanded when localStorage is empty', () => {
      render(<InspectorDock />);
      expect(screen.getByTestId('inspector-dock')).toHaveAttribute('data-collapsed', 'false');
    });

    it('should rehydrate collapsed=true from localStorage on mount', () => {
      localStorage.setItem(INSPECTOR_DOCK_STORAGE_KEY, 'true');
      render(<InspectorDock />);
      expect(screen.getByTestId('inspector-dock')).toHaveAttribute('data-collapsed', 'true');
    });

    it('should fall back to expanded when stored value is invalid JSON', () => {
      localStorage.setItem(INSPECTOR_DOCK_STORAGE_KEY, '{not-json');
      render(<InspectorDock />);
      expect(screen.getByTestId('inspector-dock')).toHaveAttribute('data-collapsed', 'false');
    });

    it('should toggle collapsed state and persist it to localStorage', async () => {
      const user = userEvent.setup();
      render(<InspectorDock />);

      await user.click(screen.getByRole('button', { name: /collapse inspector/i }));

      expect(screen.getByTestId('inspector-dock')).toHaveAttribute('data-collapsed', 'true');
      expect(localStorage.getItem(INSPECTOR_DOCK_STORAGE_KEY)).toBe('true');
    });

    it('should not throw when localStorage.setItem fails', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      const user = userEvent.setup();
      render(<InspectorDock />);

      await expect(
        user.click(screen.getByRole('button', { name: /collapse inspector/i })),
      ).resolves.not.toThrow();

      setItemSpy.mockRestore();
    });
  });

  describe('auto-switch on running execution', () => {
    it('should switch the active tab to Run when status transitions to running', () => {
      render(<InspectorDock />);
      const tabs = () => screen.getAllByRole('tab');
      expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');

      act(() => {
        useExecutionLiveStore.getState().setStatus('running');
      });

      expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('should not steal focus away from a tab the user has manually picked while idle', async () => {
      const user = userEvent.setup();
      render(<InspectorDock />);

      await user.click(screen.getByRole('tab', { name: /logs/i }));
      expect(screen.getByRole('tab', { name: /logs/i })).toHaveAttribute('aria-selected', 'true');
    });
  });
});
