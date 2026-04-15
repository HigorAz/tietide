import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeType } from '@tietide/shared';
import { NodeLibrary } from './NodeLibrary';

const getItem = (label: string): HTMLElement => {
  const element = screen.getByText(label).closest('[data-testid="node-library-item"]');
  if (!element) throw new Error(`Library item with label "${label}" not found`);
  return element as HTMLElement;
};

describe('NodeLibrary', () => {
  describe('rendering', () => {
    it('should render all 6 node types grouped under Triggers and Actions', () => {
      render(<NodeLibrary />);

      const triggers = screen.getByRole('region', { name: /triggers/i });
      expect(within(triggers).getByText('Manual Trigger')).toBeInTheDocument();
      expect(within(triggers).getByText('Cron Trigger')).toBeInTheDocument();
      expect(within(triggers).getByText('Webhook Trigger')).toBeInTheDocument();
      expect(within(triggers).queryAllByTestId('node-library-item')).toHaveLength(3);

      const actions = screen.getByRole('region', { name: /actions/i });
      expect(within(actions).getByText('HTTP Request')).toBeInTheDocument();
      expect(within(actions).getByText('Code')).toBeInTheDocument();
      expect(within(actions).getByText('Conditional (IF)')).toBeInTheDocument();
      expect(within(actions).queryAllByTestId('node-library-item')).toHaveLength(3);
    });

    it('should render an icon, name, and description on every item', () => {
      render(<NodeLibrary />);
      const items = screen.getAllByTestId('node-library-item');
      expect(items).toHaveLength(6);
      items.forEach((item) => {
        expect(item.querySelector('svg')).toBeInTheDocument();
      });
      expect(screen.getByText('Start workflow manually')).toBeInTheDocument();
      expect(screen.getByText('Make an HTTP request to an external API')).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('should filter items by name (case-insensitive)', async () => {
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'http');

      expect(screen.getByText('HTTP Request')).toBeInTheDocument();
      expect(screen.queryByText('Manual Trigger')).not.toBeInTheDocument();
      expect(screen.queryByText('Code')).not.toBeInTheDocument();
    });

    it('should filter items by description', async () => {
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'schedule');

      const items = screen.getAllByTestId('node-library-item');
      expect(items).toHaveLength(1);
      expect(screen.getByText('Cron Trigger')).toBeInTheDocument();
    });

    it('should show an empty state when no items match', async () => {
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'zzzzzz');

      expect(screen.queryAllByTestId('node-library-item')).toHaveLength(0);
      expect(screen.getByText(/no nodes match/i)).toBeInTheDocument();
    });

    it('should restore all items when the search input is cleared', async () => {
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const input = screen.getByPlaceholderText(/search/i);
      await user.type(input, 'http');
      await user.clear(input);

      expect(screen.getAllByTestId('node-library-item')).toHaveLength(6);
    });
  });

  describe('drag-and-drop', () => {
    it('should write the node type to the drag dataTransfer when drag starts', () => {
      render(<NodeLibrary />);
      const item = getItem('Manual Trigger');
      const setData = vi.fn();
      const dataTransfer = { setData, effectAllowed: 'none' };

      fireEvent.dragStart(item, { dataTransfer });

      expect(setData).toHaveBeenCalledWith(
        'application/reactflow-node-type',
        NodeType.MANUAL_TRIGGER,
      );
      expect(dataTransfer.effectAllowed).toBe('copy');
    });

    it('should mark every item as draggable', () => {
      render(<NodeLibrary />);
      screen.getAllByTestId('node-library-item').forEach((item) => {
        expect(item).toHaveAttribute('draggable', 'true');
      });
    });
  });
});
