import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeType, Role } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { RECENTLY_USED_NODES_LIMIT, recentlyUsedNodesKey } from '@/utils/recentlyUsedNodes';
import { NODE_LIBRARY_COLLAPSE_KEY } from '@/utils/nodeLibraryCollapse';

const TEST_USER_ID = 'user-test';

const setUser = (id: string = TEST_USER_ID): void => {
  useAuthStore.setState({
    user: { id, email: 'tester@tietide.dev', name: 'Tester', role: Role.USER },
    token: 'jwt-test',
  });
};

const getItem = (label: string): HTMLElement => {
  const element = screen.getByText(label).closest('[data-testid="node-library-item"]');
  if (!element) throw new Error(`Library item with label "${label}" not found`);
  return element as HTMLElement;
};

beforeEach(() => {
  localStorage.clear();
  setUser();
});

afterEach(() => {
  useAuthStore.setState({ user: null, token: null });
  vi.unstubAllGlobals();
});

// Tests that need to extend NODE_CATALOG (e.g. provider/group filtering) live
// in their own file because vi.mock applies once per module-load.
describe('NodeLibrary', () => {
  // Import lazily inside each test so the module is fresh per call. Type
  // annotation is omitted to satisfy `consistent-type-imports`; TypeScript
  // infers `Promise<typeof import('./NodeLibrary')>`.
  const importComponent = async () => import('./NodeLibrary');

  describe('rendering', () => {
    it('should render the visible node types grouped by category', async () => {
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);

      const triggers = screen.getByRole('region', { name: /triggers/i });
      expect(within(triggers).getByText('Manual Trigger')).toBeInTheDocument();
      expect(within(triggers).getByText('Cron Trigger')).toBeInTheDocument();
      expect(within(triggers).getByText('Webhook Trigger')).toBeInTheDocument();
      expect(within(triggers).queryAllByTestId('node-library-item')).toHaveLength(3);

      const actions = screen.getByRole('region', { name: /actions/i });
      expect(within(actions).getByText('HTTP Request')).toBeInTheDocument();
      expect(within(actions).queryAllByTestId('node-library-item')).toHaveLength(1);

      const logic = screen.getByRole('region', { name: /^logic$/i });
      expect(within(logic).getByText('Conditional (IF)')).toBeInTheDocument();
      expect(within(logic).getByText('Iterator (For Each)')).toBeInTheDocument();
      expect(within(logic).getByText('Subworkflow')).toBeInTheDocument();
      expect(within(logic).getByText('Return')).toBeInTheDocument();
      expect(within(logic).queryAllByTestId('node-library-item')).toHaveLength(4);

      const custom = screen.getByRole('region', { name: /^custom$/i });
      expect(within(custom).getByText('Sticky Note')).toBeInTheDocument();
      expect(within(custom).queryAllByTestId('node-library-item')).toHaveLength(1);
    });

    it('should not expose forbidden node types (Code) in the palette', async () => {
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);
      expect(screen.queryByText('Code')).not.toBeInTheDocument();
    });

    it('should render an icon and name on every item, with description in the title attribute', async () => {
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);
      const items = screen.getAllByTestId('node-library-item');
      // 3 triggers + 1 generic action (http-request, code forbidden) + 4 logic
      // + 2 Communication (Gmail) + 6 Productivity (Drive/Sheets/Docs/Calendar)
      // + 1 Custom (Sticky) = 17.
      expect(items).toHaveLength(17);
      items.forEach((item) => {
        expect(item.querySelector('svg')).toBeInTheDocument();
      });
      // Description is hidden inline; available via the title attribute (also
      // mirrored into the Radix Tooltip content for visual hover styling).
      expect(screen.getByTitle('Start workflow manually')).toBeInTheDocument();
      expect(screen.getByTitle('Make an HTTP request to an external API')).toBeInTheDocument();
      // No inline description text.
      expect(screen.queryByText('Start workflow manually')).not.toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('should filter items by name (case-insensitive)', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'http');

      expect(screen.getByText('HTTP Request')).toBeInTheDocument();
      expect(screen.queryByText('Manual Trigger')).not.toBeInTheDocument();
      expect(screen.queryByText('Code')).not.toBeInTheDocument();
    });

    it('should filter items by description', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'schedule');

      const items = screen.getAllByTestId('node-library-item');
      expect(items).toHaveLength(1);
      expect(screen.getByText('Cron Trigger')).toBeInTheDocument();
    });

    it('should filter items by category/group label', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'logic');

      const items = screen.getAllByTestId('node-library-item');
      expect(items).toHaveLength(4);
      expect(screen.getByText('Conditional (IF)')).toBeInTheDocument();
      expect(screen.getByText('Iterator (For Each)')).toBeInTheDocument();
      expect(screen.getByText('Subworkflow')).toBeInTheDocument();
      expect(screen.getByText('Return')).toBeInTheDocument();
    });

    it('should show an empty state when no items match', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'zzzzzz');

      expect(screen.queryAllByTestId('node-library-item')).toHaveLength(0);
      expect(screen.getByText(/no nodes match/i)).toBeInTheDocument();
    });

    it('should restore all items when the search input is cleared', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const input = screen.getByPlaceholderText(/search/i);
      await user.type(input, 'http');
      await user.clear(input);

      expect(screen.getAllByTestId('node-library-item')).toHaveLength(17);
    });
  });

  describe('drag-and-drop', () => {
    it('should write the node type to the drag dataTransfer when drag starts', async () => {
      const { NodeLibrary } = await importComponent();
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

    it('should mark every item as draggable', async () => {
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);
      screen.getAllByTestId('node-library-item').forEach((item) => {
        expect(item).toHaveAttribute('draggable', 'true');
      });
    });
  });

  describe('recently used', () => {
    it('should add a node to the Recently used list when the user starts dragging it', async () => {
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);

      // Initially no Recently used section.
      expect(screen.queryByRole('region', { name: /recently used/i })).not.toBeInTheDocument();

      fireEvent.dragStart(getItem('Manual Trigger'), {
        dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
      });

      const recent = await screen.findByRole('region', { name: /recently used/i });
      expect(within(recent).getByText('Manual Trigger')).toBeInTheDocument();
    });

    it('should persist recently used across renders via localStorage', async () => {
      localStorage.setItem(
        recentlyUsedNodesKey(TEST_USER_ID),
        JSON.stringify([NodeType.HTTP_REQUEST, NodeType.MANUAL_TRIGGER]),
      );
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);

      const recent = await screen.findByRole('region', { name: /recently used/i });
      const items = within(recent).getAllByTestId('node-library-item');
      // Most-recent-first ordering preserved from storage.
      expect(within(items[0]).getByText('HTTP Request')).toBeInTheDocument();
      expect(within(items[1]).getByText('Manual Trigger')).toBeInTheDocument();
    });

    it('should cap the Recently used list at the configured limit', async () => {
      const tooMany = Array.from(
        { length: RECENTLY_USED_NODES_LIMIT + 2 },
        () => NodeType.HTTP_REQUEST,
      );
      localStorage.setItem(recentlyUsedNodesKey(TEST_USER_ID), JSON.stringify(tooMany));
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);

      // Hydrated list is deduped to a single HTTP Request entry, capped at the limit.
      const recent = await screen.findByRole('region', { name: /recently used/i });
      expect(within(recent).queryAllByTestId('node-library-item').length).toBeLessThanOrEqual(
        RECENTLY_USED_NODES_LIMIT,
      );
    });

    it('should not surface a Recently used section for an unauthenticated user', async () => {
      useAuthStore.setState({ user: null, token: null });
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);

      fireEvent.dragStart(getItem('Manual Trigger'), {
        dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
      });

      expect(screen.queryByRole('region', { name: /recently used/i })).not.toBeInTheDocument();
    });
  });

  describe('collapsible groups', () => {
    it("should hide a group's items when its header is clicked", async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const triggers = screen.getByRole('region', { name: /triggers/i });
      expect(within(triggers).queryAllByTestId('node-library-item')).toHaveLength(3);

      const header = within(triggers).getByRole('button', { name: /triggers/i });
      expect(header).toHaveAttribute('aria-expanded', 'true');

      await user.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'false');
      // Items are removed (or hidden) from the visible region — they should not
      // render as draggable cards once collapsed.
      expect(within(triggers).queryAllByTestId('node-library-item')).toHaveLength(0);
    });

    it("should restore a group's items when the header is clicked again", async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const triggers = screen.getByRole('region', { name: /triggers/i });
      const header = within(triggers).getByRole('button', { name: /triggers/i });

      await user.click(header);
      await user.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'true');
      expect(within(triggers).queryAllByTestId('node-library-item')).toHaveLength(3);
    });

    it('should persist collapsed state in localStorage', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const triggers = screen.getByRole('region', { name: /triggers/i });
      await user.click(within(triggers).getByRole('button', { name: /triggers/i }));

      const stored = localStorage.getItem(NODE_LIBRARY_COLLAPSE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored as string) as Record<string, boolean>;
      expect(parsed.triggers).toBe(true);
    });
  });
});
