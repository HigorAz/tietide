import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { ClaudeMessagesForm } from './ClaudeMessagesForm';

const NODE_ID = 'node-claude-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const seedAnthropicConnection = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'anthropic',
        name: 'My Anthropic key',
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

describe('ClaudeMessagesForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    seedAnthropicConnection();
    render(
      <ClaudeMessagesForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, prompt: 'Summarize this' }}
      />,
    );
    expect(screen.getByTestId('claude-messages-form')).toBeInTheDocument();
  });

  it('shows required-field errors when prompt is missing', () => {
    seedAnthropicConnection();
    render(
      <ClaudeMessagesForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID, prompt: '' }} />,
    );
    expect(screen.getByTestId('claude-messages-prompt-error')).toBeInTheDocument();
  });

  it('shows the connection-required error when no connection is selected', () => {
    seedAnthropicConnection();
    render(<ClaudeMessagesForm nodeId={NODE_ID} config={{ prompt: 'hi' }} />);
    expect(screen.getByTestId('claude-messages-connection-error')).toBeInTheDocument();
  });

  it('calls updateNodeConfig when the model field changes', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedAnthropicConnection();
    render(
      <ClaudeMessagesForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, prompt: 'hi' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^model$/i), {
      target: { value: 'claude-opus-4-7' },
    });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { model: 'claude-opus-4-7' });
  });

  it('toggles enablePromptCaching via the checkbox', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedAnthropicConnection();
    render(
      <ClaudeMessagesForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, prompt: 'hi' }}
      />,
    );
    fireEvent.click(screen.getByLabelText(/prompt caching/i));
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { enablePromptCaching: true });
  });
});
