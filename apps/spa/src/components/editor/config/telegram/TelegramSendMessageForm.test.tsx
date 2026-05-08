import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { TelegramSendMessageForm } from './TelegramSendMessageForm';

const NODE_ID = 'node-telegram-1';
const CONNECTION_ID = '44444444-4444-4444-8444-444444444444';

const seedTelegramConnection = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'telegram',
        name: 'Acme Bot',
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

describe('TelegramSendMessageForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    seedTelegramConnection();
    render(
      <TelegramSendMessageForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, chatId: '123456789', text: 'hi' }}
      />,
    );
    expect(screen.getByTestId('telegram-send-message-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seedTelegramConnection();
    render(<TelegramSendMessageForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('telegram-send-message-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('telegram-send-message-chat-error')).toBeInTheDocument();
    expect(screen.getByTestId('telegram-send-message-text-error')).toBeInTheDocument();
  });

  it('shows a chatId error when chatId is malformed', () => {
    seedTelegramConnection();
    render(
      <TelegramSendMessageForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, chatId: 'not a valid chat', text: 'hi' }}
      />,
    );
    expect(screen.getByTestId('telegram-send-message-chat-error')).toBeInTheDocument();
  });
});
