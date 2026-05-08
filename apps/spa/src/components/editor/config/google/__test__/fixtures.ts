import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import type { ConnectionView } from '@/api/connections';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';

export const NODE_ID = 'node-google-1';
export const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

export const seedConnection = (overrides: Partial<ConnectionView> = {}): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.OAUTH2,
        provider: 'google',
        name: 'Work Google',
        status: ConnectionStatus.ACTIVE,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
        ...overrides,
      },
    ],
    status: 'ready',
    error: null,
    testingIds: {},
    deletingIds: {},
  });
};

export const resetGoogleFormState = (): void => {
  resetConnectionsStore();
  useEditorStore.setState({ ...initialEditorState });
};
