import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { SlackPostMessageForm } from './SlackPostMessageForm';

const NODE_ID = 'node-slack-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const seedSlackConnection = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.OAUTH2,
        provider: 'slack',
        name: 'Acme Slack',
        status: ConnectionStatus.ACTIVE,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
    status: 'ready',
    error: null,
    testingIds: {},
    deletingIds: {},
  });
};

describe('SlackPostMessageForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    seedSlackConnection();
    render(
      <SlackPostMessageForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, channel: 'C0123ABCDEF', text: 'hi' }}
      />,
    );
    expect(screen.getByTestId('slack-post-message-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seedSlackConnection();
    render(<SlackPostMessageForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('slack-post-message-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('slack-post-message-channel-error')).toBeInTheDocument();
    expect(screen.getByTestId('slack-post-message-text-error')).toBeInTheDocument();
  });

  it('shows a channel-format error when channel is not a Slack ID', () => {
    seedSlackConnection();
    render(
      <SlackPostMessageForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, channel: 'general', text: 'hi' }}
      />,
    );
    expect(screen.getByTestId('slack-post-message-channel-error')).toBeInTheDocument();
  });

  it('calls updateNodeConfig when text is typed', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedSlackConnection();
    render(
      <SlackPostMessageForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, channel: 'C0123ABCDEF', text: '' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: 'hello' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { text: 'hello' });
  });
});
