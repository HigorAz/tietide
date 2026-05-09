import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { AirtableCreateRecordForm } from './AirtableCreateRecordForm';

const NODE_ID = 'node-airtable-1';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const seed = (): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.API_KEY,
        provider: 'airtable',
        name: 'My Airtable',
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

describe('AirtableCreateRecordForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders with current config', () => {
    seed();
    render(
      <AirtableCreateRecordForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          baseId: 'appAAAAAAAAAAAAAA',
          tableIdOrName: 'Tasks',
          fields: { Name: 'x' },
        }}
      />,
    );
    expect(screen.getByTestId('airtable-create-record-form')).toBeInTheDocument();
  });

  it('shows required-field errors when config is empty', () => {
    seed();
    render(<AirtableCreateRecordForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('airtable-create-record-connection-error')).toBeInTheDocument();
    expect(screen.getByTestId('airtable-create-record-base-error')).toBeInTheDocument();
    expect(screen.getByTestId('airtable-create-record-table-error')).toBeInTheDocument();
  });

  it('shows base-format error when baseId is malformed', () => {
    seed();
    render(
      <AirtableCreateRecordForm
        nodeId={NODE_ID}
        config={{
          connectionId: CONNECTION_ID,
          baseId: 'NOT_A_BASE',
          tableIdOrName: 'Tasks',
          fields: { Name: 'x' },
        }}
      />,
    );
    expect(screen.getByTestId('airtable-create-record-base-error')).toBeInTheDocument();
  });
});
