import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { OpenAIChatCompletionForm } from './OpenAIChatCompletionForm';

const NODE_ID = 'node-openai-1';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

const seedOpenaiConnection = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'openai',
        name: 'My OpenAI key',
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

describe('OpenAIChatCompletionForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    seedOpenaiConnection();
    render(
      <OpenAIChatCompletionForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, prompt: 'hi' }}
      />,
    );
    expect(screen.getByTestId('openai-chat-completion-form')).toBeInTheDocument();
  });

  it('shows the prompt-required error when prompt is empty', () => {
    seedOpenaiConnection();
    render(
      <OpenAIChatCompletionForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, prompt: '' }}
      />,
    );
    expect(screen.getByTestId('openai-chat-completion-prompt-error')).toBeInTheDocument();
  });

  it('shows the connection-required error when no connection is selected', () => {
    seedOpenaiConnection();
    render(<OpenAIChatCompletionForm nodeId={NODE_ID} config={{ prompt: 'hi' }} />);
    expect(screen.getByTestId('openai-chat-completion-connection-error')).toBeInTheDocument();
  });

  it('calls updateNodeConfig when the model field changes', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedOpenaiConnection();
    render(
      <OpenAIChatCompletionForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, prompt: 'hi' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^model$/i), {
      target: { value: 'gpt-4-turbo' },
    });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { model: 'gpt-4-turbo' });
  });
});
