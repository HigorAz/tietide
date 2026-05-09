import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { GitHubCreateIssueForm } from './GitHubCreateIssueForm';

const NODE_ID = 'node-github-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const seed = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'github',
        name: 'My GitHub',
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

describe('GitHubCreateIssueForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders with current config', () => {
    seed();
    render(
      <GitHubCreateIssueForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          owner: 'octocat',
          repo: 'hello-world',
          title: 'Bug',
        }}
      />,
    );
    expect(screen.getByTestId('github-create-issue-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seed();
    render(<GitHubCreateIssueForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('github-create-issue-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('github-create-issue-owner-error')).toBeInTheDocument();
    expect(screen.getByTestId('github-create-issue-repo-error')).toBeInTheDocument();
    expect(screen.getByTestId('github-create-issue-title-error')).toBeInTheDocument();
  });

  it('shows owner-format error when owner is invalid', () => {
    seed();
    render(
      <GitHubCreateIssueForm
        nodeId={NODE_ID}
        config={{ connectionId: CONNECTION_ID, owner: '-bad-', repo: 'r', title: 'x' }}
      />,
    );
    expect(screen.getByTestId('github-create-issue-owner-error')).toBeInTheDocument();
  });
});
