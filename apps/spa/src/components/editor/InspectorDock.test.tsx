import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialExecutionLiveState, useExecutionLiveStore } from '@/stores/executionLiveStore';

vi.mock('reactflow', () => ({
  __esModule: true,
  MiniMap: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="reactflow-minimap-stub">{children}</div>
  ),
}));

vi.mock('./VersionHistoryPanel', () => ({
  __esModule: true,
  VersionHistoryPanel: () => <div data-testid="version-history-panel-stub" />,
}));

import {
  InspectorDock,
  INSPECTOR_DOCK_STORAGE_KEY,
  INSPECTOR_DOCK_SIZE_STORAGE_KEY,
} from './InspectorDock';

describe('InspectorDock', () => {
  beforeEach(() => {
    localStorage.clear();
    useExecutionLiveStore.setState({ ...initialExecutionLiveState });
  });

  describe('rendering', () => {
    it('should render five tabs labelled Overview, Run, Logs, Versions, Docs', () => {
      render(<InspectorDock />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(5);
      expect(tabs[0]).toHaveAccessibleName(/overview/i);
      expect(tabs[1]).toHaveAccessibleName(/run/i);
      expect(tabs[2]).toHaveAccessibleName(/logs/i);
      expect(tabs[3]).toHaveAccessibleName(/versions/i);
      expect(tabs[4]).toHaveAccessibleName(/docs/i);
    });

    it('should mount the VersionHistoryPanel when the Versions tab is selected', async () => {
      const user = userEvent.setup();
      render(<InspectorDock />);

      await user.click(screen.getByRole('tab', { name: /versions/i }));

      expect(screen.getByTestId('version-history-panel-stub')).toBeInTheDocument();
    });

    it('should default to the Overview tab and render the workflow stats dashboard', () => {
      render(<InspectorDock />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('inspector-overview-panel')).toBeInTheDocument();
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

  describe('resize', () => {
    it('should render a resize handle when expanded', () => {
      render(<InspectorDock />);
      expect(screen.getByTestId('inspector-dock-resize-handle')).toBeInTheDocument();
    });

    it('should not render a resize handle when collapsed', () => {
      localStorage.setItem(INSPECTOR_DOCK_STORAGE_KEY, 'true');
      render(<InspectorDock />);
      expect(screen.queryByTestId('inspector-dock-resize-handle')).not.toBeInTheDocument();
    });

    it('should default to the legacy 320 x 288 size when localStorage has no size', () => {
      render(<InspectorDock />);
      const dock = screen.getByTestId('inspector-dock');
      expect(dock.style.width).toBe('320px');
      expect(dock.style.height).toBe('288px');
    });

    it('should rehydrate a persisted size from localStorage', () => {
      localStorage.setItem(
        INSPECTOR_DOCK_SIZE_STORAGE_KEY,
        JSON.stringify({ width: 560, height: 480 }),
      );
      render(<InspectorDock />);
      const dock = screen.getByTestId('inspector-dock');
      expect(dock.style.width).toBe('560px');
      expect(dock.style.height).toBe('480px');
    });

    it('should fall back to defaults when stored size is invalid JSON', () => {
      localStorage.setItem(INSPECTOR_DOCK_SIZE_STORAGE_KEY, '{not-json');
      render(<InspectorDock />);
      const dock = screen.getByTestId('inspector-dock');
      expect(dock.style.width).toBe('320px');
      expect(dock.style.height).toBe('288px');
    });

    it('should grow the dock when the user drags the NW handle up-and-left', () => {
      render(<InspectorDock />);
      const dock = screen.getByTestId('inspector-dock');
      const handle = screen.getByTestId('inspector-dock-resize-handle');

      // Default 320x288. Drag handle from (1000, 800) to (900, 700) → +100, +100.
      fireEvent.mouseDown(handle, { clientX: 1000, clientY: 800 });
      fireEvent.mouseMove(window, { clientX: 900, clientY: 700 });

      expect(dock.style.width).toBe('420px');
      expect(dock.style.height).toBe('388px');
    });

    it('should persist the new size to localStorage on mouse up', () => {
      render(<InspectorDock />);
      const handle = screen.getByTestId('inspector-dock-resize-handle');

      fireEvent.mouseDown(handle, { clientX: 1000, clientY: 800 });
      fireEvent.mouseMove(window, { clientX: 800, clientY: 600 });
      fireEvent.mouseUp(window);

      const stored = localStorage.getItem(INSPECTOR_DOCK_SIZE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored as string);
      expect(parsed).toEqual({ width: 520, height: 488 });
    });

    it('should clamp size to the minimum bounds (320 x 200)', () => {
      render(<InspectorDock />);
      const dock = screen.getByTestId('inspector-dock');
      const handle = screen.getByTestId('inspector-dock-resize-handle');

      // Drag DOWN-RIGHT (positive dx, dy) so the dock would shrink below mins.
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 1000, clientY: 1000 });

      // Clamped at the floor, never below 320 x 200.
      expect(dock.style.width).toBe('320px');
      expect(dock.style.height).toBe('200px');
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
