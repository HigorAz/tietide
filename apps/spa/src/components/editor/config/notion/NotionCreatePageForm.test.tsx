import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { NotionCreatePageForm } from './NotionCreatePageForm';

const NODE_ID = 'node-notion-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const seed = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.OAUTH2,
        provider: 'notion',
        name: 'My Notion',
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

describe('NotionCreatePageForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders with current config', () => {
    seed();
    render(
      <NotionCreatePageForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          parentDatabaseId: '0123456789abcdef0123456789abcdef',
          properties: { Name: { title: [{ text: { content: 'x' } }] } },
        }}
      />,
    );
    expect(screen.getByTestId('notion-create-page-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seed();
    render(<NotionCreatePageForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('notion-create-page-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('notion-create-page-database-error')).toBeInTheDocument();
  });

  it('shows database-format error when parentDatabaseId is malformed', () => {
    seed();
    render(
      <NotionCreatePageForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, parentDatabaseId: 'too-short', properties: {} }}
      />,
    );
    expect(screen.getByTestId('notion-create-page-database-error')).toBeInTheDocument();
  });
});
