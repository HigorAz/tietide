import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { ConnectionPicker } from '../ConnectionPicker';
import { useReportConfigValidity } from './StepLayoutContext';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { useConnectionsStore } from '@/stores/connectionsStore';
import type { ConnectionView } from '@/api/connections';
import { ConfigSteps } from './ConfigSteps';
import type { NodeConfigFormProps } from '../config/formRegistry';

// ── Fakes ────────────────────────────────────────────────────────────────────

const NODE_ID = 'node-1';

const googleConnection: ConnectionView = {
  id: 'conn-google-1',
  type: 'CUSTOM' as ConnectionView['type'],
  provider: 'google',
  name: 'My Google',
  status: 'ACTIVE' as ConnectionView['status'],
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

/** A node form with no connection requirement (renders no ConnectionPicker). */
const PlainForm: ComponentType<NodeConfigFormProps> = ({ nodeId }) => (
  <div data-testid="plain-form-body">plain form for {nodeId}</div>
);

/**
 * A connector form: renders a real ConnectionPicker (so it registers the
 * connection step + portals into the slot) and reports configure validity.
 */
function makeConnectorForm(opts: {
  value: string | null;
  valid: boolean;
}): ComponentType<NodeConfigFormProps> {
  return function ConnectorForm({ nodeId }: NodeConfigFormProps) {
    useReportConfigValidity(opts.valid);
    return (
      <div data-testid="connector-form-body">
        <ConnectionPicker provider="google" value={opts.value} onChange={() => {}} />
        <span>config for {nodeId}</span>
      </div>
    );
  };
}

const renderSteps = (
  Form: ComponentType<NodeConfigFormProps> | undefined,
  config: Record<string, unknown> = {},
) => render(<ConfigSteps nodeId={NODE_ID} config={config} Form={Form} />);

beforeEach(() => {
  useEditorStore.setState({
    ...initialEditorState,
    nodes: [
      {
        id: NODE_ID,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { label: 'Node', nodeType: 'http-request', status: 'idle', config: {} },
      },
    ],
    selectedNodeId: NODE_ID,
  });
  useConnectionsStore.setState({
    connections: [googleConnection],
    status: 'ready',
    error: null,
  });
});

describe('ConfigSteps', () => {
  it('renders exactly Configure + Test (no Connection step) for a form without a picker', () => {
    renderSteps(PlainForm);

    expect(screen.queryByTestId('config-step-connection')).not.toBeInTheDocument();
    const configure = screen.getByTestId('config-step-configure');
    const test = screen.getByTestId('config-step-test');
    // Renumbered: Configure is step 1, Test is step 2.
    expect(within(configure).getByText('Configure')).toBeInTheDocument();
    expect(within(test).getByText('Test')).toBeInTheDocument();
  });

  it('renders 3 steps and puts the connection card inside the step-1 body for a connector form', () => {
    renderSteps(makeConnectorForm({ value: null, valid: true }));

    const connection = screen.getByTestId('config-step-connection');
    expect(connection).toBeInTheDocument();
    expect(screen.getByTestId('config-step-configure')).toBeInTheDocument();
    expect(screen.getByTestId('config-step-test')).toBeInTheDocument();

    // The ConnectionPicker portals its ConnectionCard into the step-1 slot.
    const slot = within(connection).getByTestId('connection-step-slot');
    expect(within(slot).getByTestId('connection-card-change')).toBeInTheDocument();
  });

  it('BLOCKER REGRESSION 1: Configure step + connection registration persist when Configure collapses', () => {
    // A selected connection makes connection+configure complete, so auto-open
    // advances OFF Configure (to Test). The Configure body must stay mounted.
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: true }));

    // Test is the active/open step now.
    expect(screen.getByTestId('config-step-test')).toHaveAttribute('data-status', 'active');

    // (a) The Configure body (the Form) is STILL in the DOM — just hidden.
    const formBody = screen.getByTestId('connector-form-body');
    expect(formBody).toBeInTheDocument();
    // Its closest keepMounted wrapper carries the `hidden` class while collapsed.
    expect(formBody.closest('.hidden')).not.toBeNull();

    // (b) The connection step + its slot are still present (registration intact).
    const connection = screen.getByTestId('config-step-connection');
    const slot = within(connection).getByTestId('connection-step-slot');
    expect(within(slot).getByTestId('connection-card-change')).toBeInTheDocument();
  });

  it('BLOCKER REGRESSION 2: a saved connector node renders all 3 steps with 1-2 done and Test active', () => {
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: true }), {
      connectionId: googleConnection.id,
      query: 'is:unread',
    });

    const connection = screen.getByTestId('config-step-connection');
    const configure = screen.getByTestId('config-step-configure');
    const test = screen.getByTestId('config-step-test');

    // Zero user interaction: steps 1-2 done, step 3 active.
    expect(connection).toHaveAttribute('data-status', 'done');
    expect(configure).toHaveAttribute('data-status', 'done');
    expect(test).toHaveAttribute('data-status', 'active');
  });

  it('locks the Test step with a "Finish step N first" summary while Configure is invalid', () => {
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: false }));

    const test = screen.getByTestId('config-step-test');
    expect(test).toHaveAttribute('data-status', 'locked');
    // Configure is step 2 here (connection step present), so "Finish step 2 first".
    expect(within(test).getByText(/finish step 2 first/i)).toBeInTheDocument();
    // The locked header button is disabled.
    expect(within(test).getByRole('button')).toBeDisabled();
  });

  it('WR-05: switching from an invalid reporting node to a non-reporting node leaves Test unlocked', () => {
    // Node A: a connector form that reports configure validity = false (Test locked).
    const InvalidConnector = makeConnectorForm({ value: googleConnection.id, valid: false });
    const { rerender } = render(
      <ConfigSteps nodeId="node-A" config={{}} Form={InvalidConnector} />,
    );
    expect(screen.getByTestId('config-step-test')).toHaveAttribute('data-status', 'locked');

    // Node B: a plain form that NEVER reports validity (manual/cron-style node).
    // The previous form's unmount cleanup must clear the stale `false`, so Test
    // is not inherited as locked even though node A left it invalid.
    rerender(<ConfigSteps nodeId="node-B" config={{}} Form={PlainForm} />);

    const test = screen.getByTestId('config-step-test');
    expect(test).not.toHaveAttribute('data-status', 'locked');
  });

  it('renders the error-handler ToggleSwitch in the Configure step body and dispatches on toggle', () => {
    renderSteps(PlainForm);

    const toggle = screen.getByTestId('node-config-error-handler-toggle');
    expect(toggle).toHaveAttribute('role', 'switch');
    fireEvent.click(toggle);

    const config = useEditorStore.getState().nodes.find((n) => n.id === NODE_ID)?.data.config;
    expect(config).toMatchObject({ hasErrorHandler: true });
  });

  it('reflects an existing hasErrorHandler:true as a checked toggle', () => {
    renderSteps(PlainForm, { hasErrorHandler: true });
    const toggle = screen.getByTestId('node-config-error-handler-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('renders the NodePreviewPanel toggle at the bottom of the Configure step', () => {
    renderSteps(PlainForm);
    expect(screen.getByTestId('node-preview-toggle')).toBeInTheDocument();
  });

  it('reopens a collapsed step when its header is clicked, closing the previously open one', () => {
    // Saved node: Test is auto-open; Configure is collapsed (done).
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: true }), {
      connectionId: googleConnection.id,
    });

    expect(screen.getByTestId('config-step-test')).toHaveAttribute('data-status', 'active');

    // Click the Configure header → it opens, Test collapses back to done.
    // The header is the section's first button (carries the step title).
    const configureHeader = within(screen.getByTestId('config-step-configure'))
      .getAllByRole('button')
      .find((b) => within(b).queryByText('Configure'));
    expect(configureHeader).toBeDefined();
    fireEvent.click(configureHeader as HTMLElement);

    expect(screen.getByTestId('config-step-configure')).toHaveAttribute('data-status', 'active');
    // Test is unlocked but not yet tested, so it collapses to pending (only one open).
    expect(screen.getByTestId('config-step-test')).toHaveAttribute('data-status', 'pending');
  });
});
