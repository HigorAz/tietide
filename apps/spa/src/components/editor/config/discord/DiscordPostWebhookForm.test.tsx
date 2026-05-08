import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { DiscordPostWebhookForm } from './DiscordPostWebhookForm';

const NODE_ID = 'node-discord-1';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

const seedDiscordConnection = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.CUSTOM,
        provider: 'discord',
        name: 'Acme Discord webhook',
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

describe('DiscordPostWebhookForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    seedDiscordConnection();
    render(
      <DiscordPostWebhookForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, content: 'hello' }}
      />,
    );
    expect(screen.getByTestId('discord-post-webhook-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seedDiscordConnection();
    render(<DiscordPostWebhookForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('discord-post-webhook-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('discord-post-webhook-content-error')).toBeInTheDocument();
  });

  it('calls updateNodeConfig when content is typed', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedDiscordConnection();
    render(
      <DiscordPostWebhookForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, content: '' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: 'hi' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { content: 'hi' });
  });
});
