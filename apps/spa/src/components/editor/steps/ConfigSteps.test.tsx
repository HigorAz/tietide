import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
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
    // useTestNode gates `canRun` on a loaded workflow — set one so a ready node's
    // Test button can actually enable.
    workflowId: 'wf-1',
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

  it('BLOCKER REGRESSION 1: Configure step + connection registration persist when Configure is collapsed', () => {
    // Every step starts expanded now; manually collapse Configure via its header
    // and assert its body stays mounted (just hidden) so the portal + form
    // registration never churn.
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: true }));

    // The Configure body is initially visible (expanded by default).
    const formBody = screen.getByTestId('connector-form-body');
    expect(formBody.closest('.hidden')).toBeNull();

    // Collapse the Configure step from its header.
    const configureHeader = within(screen.getByTestId('config-step-configure'))
      .getAllByRole('button')
      .find((b) => within(b).queryByText('Configure'));
    fireEvent.click(configureHeader as HTMLElement);

    // (a) The Configure body (the Form) is STILL in the DOM — just hidden.
    expect(formBody).toBeInTheDocument();
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

  it('PERSISTENCE: a previously-tested node (persisted sample) opens all 3 steps done, no Continue', () => {
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: true }), {
      connectionId: googleConnection.id,
      query: 'is:unread',
      [PILL_SAMPLE_KEY]: { id: 1 },
    });

    expect(screen.getByTestId('config-step-connection')).toHaveAttribute('data-status', 'done');
    expect(screen.getByTestId('config-step-configure')).toHaveAttribute('data-status', 'done');
    // The Test step is restored as done from the persisted sample — not "not done".
    expect(screen.getByTestId('config-step-test')).toHaveAttribute('data-status', 'done');

    // Expanded layout: the Configure body is visible (not collapsed/hidden)…
    expect(screen.getByTestId('connector-form-body').closest('.hidden')).toBeNull();
    // …and there is no Continue button — it is all done already.
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });

  it('RE-ARM: editing config on a tested node re-arms the Test step (no Continue button)', () => {
    const Form = makeConnectorForm({ value: googleConnection.id, valid: true });
    const base = { connectionId: googleConnection.id, [PILL_SAMPLE_KEY]: { id: 1 } };

    const { rerender } = render(
      <ConfigSteps nodeId={NODE_ID} config={{ ...base, query: 'a' }} Form={Form} />,
    );
    expect(screen.getByTestId('config-step-test')).toHaveAttribute('data-status', 'done');

    // Simulate a Configure edit: the parent feeds a changed config prop.
    rerender(<ConfigSteps nodeId={NODE_ID} config={{ ...base, query: 'b' }} Form={Form} />);

    // Test re-arms to active; the guided-flow Continue button no longer exists.
    expect(screen.getByTestId('config-step-test')).toHaveAttribute('data-status', 'active');
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });

  it('keeps the Test step open+active (never locked) while Configure is invalid, but disables its run button', () => {
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: false }));

    const test = screen.getByTestId('config-step-test');
    // No locking — the step is just active and expanded.
    expect(test).not.toHaveAttribute('data-status', 'locked');
    expect(test).toHaveAttribute('data-status', 'active');
    // Its run button is disabled with the not-ready reason as the tooltip.
    const runButton = within(test).getByTestId('test-step-run');
    expect(runButton).toBeDisabled();
    expect(runButton).toHaveAttribute('title', 'Complete the Configure step first');
  });

  it('enables the Test run button once Configure is valid and a connection is selected', () => {
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: true }), {
      connectionId: googleConnection.id,
    });

    const test = screen.getByTestId('config-step-test');
    expect(within(test).getByTestId('test-step-run')).toBeEnabled();
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

  it('collapses only the clicked step, leaving the other steps expanded (no single-open invariant)', () => {
    renderSteps(makeConnectorForm({ value: googleConnection.id, valid: true }), {
      connectionId: googleConnection.id,
    });

    // All steps start expanded: the Configure body is visible.
    const formBody = screen.getByTestId('connector-form-body');
    expect(formBody.closest('.hidden')).toBeNull();

    // Click the Configure header → only Configure collapses (its body hides).
    const configureHeader = within(screen.getByTestId('config-step-configure'))
      .getAllByRole('button')
      .find((b) => within(b).queryByText('Configure'));
    expect(configureHeader).toBeDefined();
    fireEvent.click(configureHeader as HTMLElement);

    expect(formBody.closest('.hidden')).not.toBeNull();
    // The Connection step is unaffected — still expanded, slot still present.
    const connection = screen.getByTestId('config-step-connection');
    expect(within(connection).getByTestId('connection-step-slot')).toBeInTheDocument();
    expect(within(connection).getByTestId('connection-step-slot').closest('.hidden')).toBeNull();

    // Click the Configure header again → it re-expands.
    fireEvent.click(configureHeader as HTMLElement);
    expect(formBody.closest('.hidden')).toBeNull();
  });
});
