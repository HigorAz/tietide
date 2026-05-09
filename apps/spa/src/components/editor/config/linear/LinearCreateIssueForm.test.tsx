import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { LinearCreateIssueForm } from './LinearCreateIssueForm';

const NODE_ID = 'node-linear-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const TEAM_ID = '22222222-2222-4222-8222-222222222222';

const seed = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'linear',
        name: 'My Linear',
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

describe('LinearCreateIssueForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders with current config', () => {
    seed();
    render(
      <LinearCreateIssueForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, teamId: TEAM_ID, title: 'Bug' }}
      />,
    );
    expect(screen.getByTestId('linear-create-issue-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seed();
    render(<LinearCreateIssueForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('linear-create-issue-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('linear-create-issue-team-error')).toBeInTheDocument();
    expect(screen.getByTestId('linear-create-issue-title-error')).toBeInTheDocument();
  });

  it('shows team-format error when teamId is not a UUID', () => {
    seed();
    render(
      <LinearCreateIssueForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, teamId: 'not-a-uuid', title: 'x' }}
      />,
    );
    expect(screen.getByTestId('linear-create-issue-team-error')).toBeInTheDocument();
  });
});
