import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import type { ConnectionView } from '@/api/connections';
import { useConnectionsStore, resetConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import type { Node } from 'reactflow';
import {
  StepLayoutProvider,
  type ConnectionStepMeta,
  type StepLayoutValue,
} from './steps/StepLayoutContext';
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

  describe('allowClear', () => {
    it('should not render a None option by default', async () => {
      const user = userEvent.setup();
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(<ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />);

      await user.click(screen.getByRole('combobox', { name: /connection/i }));
      expect(screen.queryByRole('option', { name: /no authentication/i })).not.toBeInTheDocument();
    });

    it('should render a None option and call onChange(null) when selected', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(<ConnectionPicker provider="google" value="g-1" onChange={onChange} allowClear />);

      await user.click(screen.getByRole('combobox', { name: /connection/i }));
      await user.click(await screen.findByRole('option', { name: /no authentication/i }));

      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('step-layout awareness', () => {
    const makeLayout = (
      slot: HTMLElement | null,
      overrides: Partial<StepLayoutValue> = {},
    ): StepLayoutValue => ({
      connectionSlot: slot,
      registerConnection: vi.fn(),
      unregisterConnection: vi.fn(),
      reportValidity: vi.fn(),
      ...overrides,
    });

    it('registers connection meta matching props when inside a step layout', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);
      const slot = document.createElement('div');
      const registerConnection = vi.fn();
      const layout = makeLayout(slot, { registerConnection });

      render(
        <StepLayoutProvider value={layout}>
          <ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />
        </StepLayoutProvider>,
      );

      expect(registerConnection).toHaveBeenCalled();
      const meta = registerConnection.mock.calls.at(-1)?.[0] as ConnectionStepMeta;
      expect(meta.provider).toBe('google');
      expect(meta.optional).toBe(false);
      expect(meta.hasSelection).toBe(true);
      expect(meta.selectedName).toBe('Work Google');
    });

    it('registers optional=true when allowClear is set', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);
      const registerConnection = vi.fn();
      const layout = makeLayout(document.createElement('div'), { registerConnection });

      render(
        <StepLayoutProvider value={layout}>
          <ConnectionPicker provider="google" value={null} onChange={vi.fn()} allowClear />
        </StepLayoutProvider>,
      );

      const meta = registerConnection.mock.calls.at(-1)?.[0] as ConnectionStepMeta;
      expect(meta.optional).toBe(true);
      expect(meta.hasSelection).toBe(false);
    });

    it('portals the picker (wrapped in a connection card) into the connection slot, not the default container', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);
      const slot = document.createElement('div');
      document.body.appendChild(slot);
      const layout = makeLayout(slot);

      const { container } = render(
        <StepLayoutProvider value={layout}>
          <ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />
        </StepLayoutProvider>,
      );

      expect(slot.querySelector('[data-testid="connection-card-change"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="connection-card-change"]')).toBeNull();
      // the underlying picker control travels into the slot as well
      expect(slot.querySelector('[role="combobox"]')).not.toBeNull();
      document.body.removeChild(slot);
    });

    it('renders nothing inline when context is present but the slot is still null', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);
      const layout = makeLayout(null);

      const { container } = render(
        <StepLayoutProvider value={layout}>
          <ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />
        </StepLayoutProvider>,
      );

      expect(container.querySelector('[role="combobox"]')).toBeNull();
    });

    it('renders inline WITHOUT a connection card when no step layout is present', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(<ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />);

      expect(screen.queryByTestId('connection-card-change')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /connection/i })).toBeInTheDocument();
    });

    it('calls unregisterConnection on unmount', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);
      const unregisterConnection = vi.fn();
      const layout = makeLayout(document.createElement('div'), { unregisterConnection });

      const { unmount } = render(
        <StepLayoutProvider value={layout}>
          <ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />
        </StepLayoutProvider>,
      );

      expect(unregisterConnection).not.toHaveBeenCalled();
      unmount();
      expect(unregisterConnection).toHaveBeenCalledTimes(1);
    });
  });

  describe('errorMessage prop', () => {
    it('renders an alert with the error message when provided', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(
        <ConnectionPicker
          provider="google"
          value={null}
          onChange={vi.fn()}
          errorMessage="Select a Google connection."
        />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Select a Google connection.');
    });

    it('does not render an alert when errorMessage is null/undefined', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(<ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('stale id warning', () => {
    it('should show a stale-id warning when value is set but no matching connection exists', () => {
      // Repro: the workflow node stored a connectionId for a connection
      // that has since been deleted/revoked. The picker used to silently
      // fall back to the placeholder, so users could not tell their saved
      // selection was gone.
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(<ConnectionPicker provider="google" value="deleted-conn-id" onChange={vi.fn()} />);

      const warning = screen.getByTestId('connection-picker-stale');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveTextContent(/unavailable|deleted|re-?pick/i);
    });

    it('should not show the stale warning when value matches a connection', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(<ConnectionPicker provider="google" value="g-1" onChange={vi.fn()} />);

      expect(screen.queryByTestId('connection-picker-stale')).not.toBeInTheDocument();
    });

    it('should not show the stale warning when value is null', () => {
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(<ConnectionPicker provider="google" value={null} onChange={vi.fn()} />);

      expect(screen.queryByTestId('connection-picker-stale')).not.toBeInTheDocument();
    });

    it('should let the user pick a fresh connection from the dropdown to clear the stale state', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      seedConnections([makeConnection({ id: 'g-1', name: 'Work Google' })]);

      render(<ConnectionPicker provider="google" value="deleted-conn-id" onChange={onChange} />);

      expect(screen.getByTestId('connection-picker-stale')).toBeInTheDocument();
      await user.click(screen.getByRole('combobox', { name: /connection/i }));
      await user.click(await screen.findByRole('option', { name: /work google/i }));

      expect(onChange).toHaveBeenCalledWith('g-1');
    });
  });
});
