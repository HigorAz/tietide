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

const expandApp = async (
  user: ReturnType<typeof userEvent.setup>,
  sectionId: 'triggers' | 'actions' | 'logic' | 'custom',
  appId: string,
): Promise<HTMLElement> => {
  const appGroup = screen.getByTestId(`node-library-app-${sectionId}-${appId}`);
  const toggle = within(appGroup).getByRole('button');
  if (toggle.getAttribute('aria-expanded') === 'false') {
    await user.click(toggle);
  }
  return appGroup;
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

describe('NodeLibrary', () => {
  const importComponent = async () => import('./NodeLibrary');

  describe('rendering', () => {
    it('should render top-level sections: Triggers, Actions, Logic, Custom', async () => {
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);

      expect(screen.getByRole('region', { name: /^triggers$/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /^actions$/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /^logic$/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /^custom$/i })).toBeInTheDocument();
    });

    it('should group core trigger types under the Core app inside Triggers', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const coreApp = await expandApp(user, 'triggers', 'core');
      expect(within(coreApp).getByText('Manual Trigger')).toBeInTheDocument();
      expect(within(coreApp).getByText('Cron Trigger')).toBeInTheDocument();
      expect(within(coreApp).getByText('Webhook Trigger')).toBeInTheDocument();
      expect(within(coreApp).queryAllByTestId('node-library-item')).toHaveLength(3);
    });

    it('should group Gmail triggers under the Gmail app inside Triggers', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const gmailApp = await expandApp(user, 'triggers', 'gmail');
      expect(within(gmailApp).getByText('Gmail: Message Received')).toBeInTheDocument();
      expect(within(gmailApp).getByText('Gmail: Label Added')).toBeInTheDocument();
      expect(within(gmailApp).queryAllByTestId('node-library-item')).toHaveLength(2);
    });

    it('should group Outlook triggers under the Outlook app inside Triggers', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const outlookApp = await expandApp(user, 'triggers', 'outlook');
      expect(within(outlookApp).getByText('Outlook: Message Received')).toBeInTheDocument();
      expect(within(outlookApp).getByText('Outlook: Message Flagged')).toBeInTheDocument();
    });

    it('should group HTTP Request and Code under Core inside Actions', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const coreApp = await expandApp(user, 'actions', 'core');
      expect(within(coreApp).getByText('HTTP Request')).toBeInTheDocument();
      expect(within(coreApp).getByText('Code')).toBeInTheDocument();
      expect(within(coreApp).queryAllByTestId('node-library-item')).toHaveLength(2);
    });

    it('should expose the Code node now that its sandboxed executor is registered', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await expandApp(user, 'actions', 'core');
      expect(screen.getByText('Code')).toBeInTheDocument();
    });

    it('should group all logic nodes under the Logic app inside the Logic section', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const logicApp = await expandApp(user, 'logic', 'logic');
      expect(within(logicApp).getByText('Conditional (IF)')).toBeInTheDocument();
      expect(within(logicApp).getByText('Iterator (For Each)')).toBeInTheDocument();
      expect(within(logicApp).getByText('Subworkflow')).toBeInTheDocument();
      expect(within(logicApp).getByText('Return')).toBeInTheDocument();
      expect(within(logicApp).queryAllByTestId('node-library-item')).toHaveLength(4);
    });

    it('should group Sticky Note under the Custom section', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const customApp = await expandApp(user, 'custom', 'custom');
      expect(within(customApp).getByText('Sticky Note')).toBeInTheDocument();
    });

    it('should render a brand or fallback icon on each app group header', async () => {
      const { NodeLibrary } = await importComponent();
      render(<NodeLibrary />);

      // Gmail app group is rendered even though its items are collapsed by default;
      // the header shows the brand icon.
      const gmailApp = screen.getByTestId('node-library-app-triggers-gmail');
      expect(within(gmailApp).getByTestId('brand-icon-gmail')).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('should filter items by name (case-insensitive) and auto-expand matching apps', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'http');

      expect(screen.getByText('HTTP Request')).toBeInTheDocument();
      expect(screen.queryByText('Manual Trigger')).not.toBeInTheDocument();
      expect(screen.queryByText('Code')).not.toBeInTheDocument();
    });

    it('should filter items by description and auto-expand the matching app', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'workflow on a sched');

      const items = screen.getAllByTestId('node-library-item');
      expect(items).toHaveLength(1);
      expect(screen.getByText('Cron Trigger')).toBeInTheDocument();
    });

    it('should match app label (e.g. searching "slack" surfaces Slack nodes)', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'slack');

      expect(screen.getByText('Slack: Post Message')).toBeInTheDocument();
      expect(screen.getByText('Slack: Message Received')).toBeInTheDocument();
    });

    it('should show an empty state when no items match', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await user.type(screen.getByPlaceholderText(/search/i), 'zzzzzz');

      expect(screen.queryAllByTestId('node-library-item')).toHaveLength(0);
      expect(screen.getByText(/no nodes match/i)).toBeInTheDocument();
    });

    it('should restore all top-level sections when the search input is cleared', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const input = screen.getByPlaceholderText(/search/i);
      await user.type(input, 'http');
      await user.clear(input);

      expect(screen.getByRole('region', { name: /^triggers$/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /^actions$/i })).toBeInTheDocument();
    });
  });

  describe('drag-and-drop', () => {
    it('should write the node type to the drag dataTransfer when drag starts', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);
      await expandApp(user, 'triggers', 'core');

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

    it('should mark every visible item as draggable', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);
      await expandApp(user, 'triggers', 'core');
      await expandApp(user, 'actions', 'core');

      screen.getAllByTestId('node-library-item').forEach((item) => {
        expect(item).toHaveAttribute('draggable', 'true');
      });
    });
  });

  describe('recently used', () => {
    it('should add a node to the Recently used list when the user starts dragging it', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      expect(screen.queryByRole('region', { name: /recently used/i })).not.toBeInTheDocument();

      await expandApp(user, 'triggers', 'core');
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

      const recent = await screen.findByRole('region', { name: /recently used/i });
      expect(within(recent).queryAllByTestId('node-library-item').length).toBeLessThanOrEqual(
        RECENTLY_USED_NODES_LIMIT,
      );
    });

    it('should not surface a Recently used section for an unauthenticated user', async () => {
      useAuthStore.setState({ user: null, token: null });
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);
      await expandApp(user, 'triggers', 'core');

      fireEvent.dragStart(getItem('Manual Trigger'), {
        dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
      });

      expect(screen.queryByRole('region', { name: /recently used/i })).not.toBeInTheDocument();
    });
  });

  describe('collapsible sections', () => {
    it("should hide a section's apps when its header is clicked", async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const triggers = screen.getByRole('region', { name: /^triggers$/i });
      expect(within(triggers).getByTestId('node-library-app-triggers-core')).toBeInTheDocument();

      const header = within(triggers).getByRole('button', { name: /^triggers$/i });
      expect(header).toHaveAttribute('aria-expanded', 'true');

      await user.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'false');
      expect(
        within(triggers).queryByTestId('node-library-app-triggers-core'),
      ).not.toBeInTheDocument();
    });

    it("should restore a section's apps when the header is clicked again", async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const triggers = screen.getByRole('region', { name: /^triggers$/i });
      const header = within(triggers).getByRole('button', { name: /^triggers$/i });

      await user.click(header);
      await user.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'true');
      expect(within(triggers).getByTestId('node-library-app-triggers-core')).toBeInTheDocument();
    });

    it('should persist section collapsed state in localStorage', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      const triggers = screen.getByRole('region', { name: /^triggers$/i });
      await user.click(within(triggers).getByRole('button', { name: /^triggers$/i }));

      const stored = localStorage.getItem(NODE_LIBRARY_COLLAPSE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored as string) as Record<string, boolean>;
      expect(parsed['section:triggers']).toBe(true);
    });

    it('should persist app group collapsed state in localStorage', async () => {
      const { NodeLibrary } = await importComponent();
      const user = userEvent.setup();
      render(<NodeLibrary />);

      await expandApp(user, 'triggers', 'core');

      const stored = localStorage.getItem(NODE_LIBRARY_COLLAPSE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored as string) as Record<string, boolean>;
      expect(parsed['app:triggers:core']).toBe(false);
    });
  });
});
