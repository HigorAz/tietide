import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { OllamaGenerateForm } from './OllamaGenerateForm';

const NODE_ID = 'node-ollama-1';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

const seedOllamaConnection = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'ollama',
        name: 'Local Ollama',
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

describe('OllamaGenerateForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the form with current config', () => {
    seedOllamaConnection();
    render(
      <OllamaGenerateForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, prompt: 'Say hi' }}
      />,
    );
    expect(screen.getByTestId('ollama-generate-form')).toBeInTheDocument();
  });

  it('shows the prompt-required error when prompt is empty', () => {
    seedOllamaConnection();
    render(
      <OllamaGenerateForm nodeId={NODE_ID} config={{ connectionId: CONNECTION_ID, prompt: '' }} />,
    );
    expect(screen.getByTestId('ollama-generate-prompt-error')).toBeInTheDocument();
  });

  it('shows the connection-required error when no connection is selected', () => {
    seedOllamaConnection();
    render(<OllamaGenerateForm nodeId={NODE_ID} config={{ prompt: 'hi' }} />);
    expect(screen.getByTestId('ollama-generate-connection-error')).toBeInTheDocument();
  });

  it('calls updateNodeConfig with model=undefined when override field is cleared', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    seedOllamaConnection();
    render(
      <OllamaGenerateForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, prompt: 'hi', model: 'mistral:7b' }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^model override/i), { target: { value: '' } });
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { model: undefined });
  });
});
