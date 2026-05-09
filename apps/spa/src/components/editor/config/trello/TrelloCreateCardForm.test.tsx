import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { TrelloCreateCardForm } from './TrelloCreateCardForm';

const NODE_ID = 'node-trello-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const seed = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'trello',
        name: 'My Trello',
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

describe('TrelloCreateCardForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders with current config', () => {
    seed();
    render(
      <TrelloCreateCardForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          listId: '60a1b2c3d4e5f6a7b8c9d0e1',
          name: 'My card',
        }}
      />,
    );
    expect(screen.getByTestId('trello-create-card-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seed();
    render(<TrelloCreateCardForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('trello-create-card-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('trello-create-card-list-error')).toBeInTheDocument();
    expect(screen.getByTestId('trello-create-card-name-error')).toBeInTheDocument();
  });

  it('shows list-format error when listId is malformed', () => {
    seed();
    render(
      <TrelloCreateCardForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, listId: 'short', name: 'x' }}
      />,
    );
    expect(screen.getByTestId('trello-create-card-list-error')).toBeInTheDocument();
  });
});
