import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import type { ConnectionView } from '@/api/connections';
import { useConnectionsStore, resetConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import type { Node } from 'reactflow';
import { ConnectionPicker } from './ConnectionPicker';

const makeConnection = (overrides: Partial<ConnectionView> = {}): ConnectionView => ({
  id: 'conn-1',
  type: ConnectionType.OAUTH2,
  provider: 'google',
  name: 'My Google',
  status: ConnectionStatus.ACTIVE,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ...overrides,
});

const seedConnections = (connections: ConnectionView[]): void => {
  useConnectionsStore.setState({
    connections,
    status: 'ready',
    error: null,
    testingIds: {},
    deletingIds: {},
  });
};

describe('ConnectionPicker', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('should render the trigger button with placeholder when no value is selected', () => {
    seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

    render(<ConnectionPicker provider="google" value={null} onChange={vi.fn()} />);

    const trigger = screen.getByRole('combobox', { name: /connection/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent(/select a google connection/i);
  });

  it('should show only connections matching the provider in the dropdown', async () => {
    const user = userEvent.setup();
    seedConnections([
      makeConnection({ id: 'g-1', name: 'Work Google', provider: 'google' }),
      makeConnection({ id: 's-1', name: 'Team Slack', provider: 'slack' }),
      makeConnection({ id: 'g-2', name: 'Personal Google', provider: 'google' }),
    ]);

    render(<ConnectionPicker provider="google" value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: /connection/i }));

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Work Google');
    expect(options[1]).toHaveTextContent('Personal Google');
    expect(screen.queryByText('Team Slack')).not.toBeInTheDocument();
  });

  it('should call onChange with the selected connection id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    seedConnections([
      makeConnection({ id: 'g-1', name: 'Work Google' }),
      makeConnection({ id: 'g-2', name: 'Personal Google' }),
    ]);

    render(<ConnectionPicker provider="google" value={null} onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: /connection/i }));
    const option = await screen.findByRole('option', { name: /personal google/i });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith('g-2');
  });

  it('should render the empty state with provider label when no compatible connections exist', () => {
    seedConnections([makeConnection({ id: 's-1', provider: 'slack', name: 'Team Slack' })]);

    render(<ConnectionPicker provider="google" value={null} onChange={vi.fn()} />);

    expect(screen.getByText(/no google connections yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('should render the empty-state link to /connections with provider preselected and connect=true, opening in a new tab', () => {
    seedConnections([]);

    render(<ConnectionPicker provider="google" value={null} onChange={vi.fn()} />);

    const link = screen.getByRole('link', { name: /add a google connection/i });
    expect(link).toHaveAttribute('href', '/connections?provider=google&connect=true');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel') ?? '').toMatch(/noopener/);
    expect(link.getAttribute('rel') ?? '').toMatch(/noreferrer/);
  });

  it('should render a status badge for each option that reflects the connection status', async () => {
    const user = userEvent.setup();
    seedConnections([
      makeConnection({ id: 'g-1', name: 'Active Google', status: ConnectionStatus.ACTIVE }),
      makeConnection({ id: 'g-2', name: 'Expired Google', status: ConnectionStatus.EXPIRED }),
      makeConnection({ id: 'g-3', name: 'Errored Google', status: ConnectionStatus.ERROR }),
    ]);

    render(<ConnectionPicker provider="google" value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: /connection/i }));

    const activeOption = await screen.findByRole('option', { name: /active google/i });
    const expiredOption = screen.getByRole('option', { name: /expired google/i });
    const errorOption = screen.getByRole('option', { name: /errored google/i });

    // Target the badge specifically via its data-status attribute so the assertion
    // doesn't accidentally match the connection name (e.g. "Active Google").
    expect(activeOption.querySelector('[data-status]')).toHaveAttribute(
      'data-status',
      ConnectionStatus.ACTIVE,
    );
    expect(within(activeOption).getByText('Active', { selector: '[data-status]' })).toBeVisible();
    expect(expiredOption.querySelector('[data-status]')).toHaveAttribute(
      'data-status',
      ConnectionStatus.EXPIRED,
    );
    expect(errorOption.querySelector('[data-status]')).toHaveAttribute(
      'data-status',
      ConnectionStatus.ERROR,
    );
  });

  it('should mark the editor dirty when the selection changes via updateNodeConfig', async () => {
    const user = userEvent.setup();
    seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

    const NODE_ID = 'node-test-1';
    const node: Node<CustomNodeData> = {
      id: NODE_ID,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'Gmail',
        description: 'Send email',
        nodeType: 'gmail.send' as never,
        status: 'idle',
        config: {},
      },
    };
    useEditorStore.setState({ ...initialEditorState, nodes: [node] });

    function Harness(): JSX.Element {
      const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
      const config =
        (useEditorStore((s) => s.nodes.find((n) => n.id === NODE_ID)?.data.config) as
          | Record<string, unknown>
          | undefined) ?? {};
      const value = (config.connectionId as string | undefined) ?? null;
      return (
        <ConnectionPicker
          provider="google"
          value={value}
          onChange={(id) => updateNodeConfig(NODE_ID, { connectionId: id })}
        />
      );
    }

    expect(useEditorStore.getState().isDirty).toBe(false);

    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: /connection/i }));
    await user.click(await screen.findByRole('option', { name: /work google/i }));

    expect(useEditorStore.getState().isDirty).toBe(true);
    const updatedConfig = useEditorStore.getState().nodes.find((n) => n.id === NODE_ID)?.data
      .config as Record<string, unknown>;
    expect(updatedConfig.connectionId).toBe('g-1');
  });

  it('should call fetch() on mount when the connections store status is idle', () => {
    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    useConnectionsStore.setState({
      connections: [],
      status: 'idle',
      error: null,
      testingIds: {},
      deletingIds: {},
      fetch: fetchSpy,
    });

    render(<ConnectionPicker provider="google" value={null} onChange={vi.fn()} />);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should render the selected connection name in the trigger when value matches a known connection', () => {
    seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

    render(<ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />);

    const trigger = screen.getByRole('combobox', { name: /connection/i });
    expect(trigger).toHaveTextContent('Work Google');
  });
});
