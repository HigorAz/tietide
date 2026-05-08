import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import type { ConnectionView } from '@/api/connections';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { GmailSendForm } from './GmailSendForm';

const NODE_ID = 'node-gmail-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const seedConnection = (overrides: Partial<ConnectionView> = {}): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.OAUTH2,
        provider: 'google',
        name: 'Work Google',
        status: ConnectionStatus.ACTIVE,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
        ...overrides,
      },
    ],
    status: 'ready',
    error: null,
    testingIds: {},
    deletingIds: {},
  });
};

describe('GmailSendForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config values', () => {
    seedConnection();
    render(
      <GmailSendForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          to: 'recipient@example.com',
          subject: 'Hello',
          body: 'Greetings',
        }}
      />,
    );

    expect(screen.getByTestId('gmail-send-form')).toBeInTheDocument();
    expect((screen.getByLabelText(/^body$/i) as HTMLTextAreaElement).value).toBe('Greetings');
  });

  it('renders the ConnectionPicker filtered to provider="google"', () => {
    seedConnection();
    render(<GmailSendForm nodeId={NODE_ID} config={{}} />);
    // ConnectionPicker uses role="combobox" with accessible name "connection"
    expect(screen.getByRole('combobox', { name: /connection/i })).toBeInTheDocument();
  });

  it('shows the empty-state CTA when no Google connections exist', () => {
    // Reset already cleared the store; explicitly set ready+empty.
    useConnectionsStore.setState({
      connections: [],
      status: 'ready',
      error: null,
      testingIds: {},
      deletingIds: {},
    });
    render(<GmailSendForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('connection-picker-empty')).toBeInTheDocument();
  });

  it('calls updateNodeConfig with new body when the user types in the body textarea', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();

    render(
      <GmailSendForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, to: 'r@e.com', subject: 'S', body: '' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^body$/i), { target: { value: 'New body' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { body: 'New body' });
  });

  it('shows required-field errors for missing connection / to / subject / body', () => {
    seedConnection();
    render(<GmailSendForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('gmail-send-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('gmail-send-to-error')).toBeInTheDocument();
    expect(screen.getByTestId('gmail-send-subject-error')).toBeInTheDocument();
    expect(screen.getByTestId('gmail-send-body-error')).toBeInTheDocument();
  });

  it('shows a header-injection error when To contains CR/LF', () => {
    seedConnection();
    render(
      <GmailSendForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          to: 'recipient@example.com\r\nBcc: evil@e.com',
          subject: 'Hi',
          body: 'B',
        }}
      />,
    );
    const err = screen.getByTestId('gmail-send-to-error');
    expect(err.textContent).toMatch(/newline/i);
  });

  it('renders DataPillInput (role=combobox) for the To field', () => {
    seedConnection();
    render(<GmailSendForm nodeId={NODE_ID} config={{}} />);
    // DataPillInput renders a transparent input with role="combobox"; the
    // ConnectionPicker also uses role="combobox" so we expect at least 2.
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('toggles mockOnDryRun when the checkbox is clicked', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedConnection();
    render(
      <GmailSendForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, to: 'r@e.com', subject: 'S', body: 'B' }}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { mockOnDryRun: true });
  });
});
