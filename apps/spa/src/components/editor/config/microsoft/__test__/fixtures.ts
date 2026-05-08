import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import type { ConnectionView } from '@/api/connections';
import { resetConnectionsStore, useConnectionsStore } from '@/stores/connectionsStore';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';

export const NODE_ID = 'node-microsoft-1';
export const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

export const seedConnection = (overrides: Partial<ConnectionView> = {}): void => {
  useConnectionsStore.setState({
    connections: [
      {
        id: CONNECTION_ID,
        type: ConnectionType.OAUTH2,
        provider: 'microsoft',
        name: 'Work Microsoft',
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

export const resetMicrosoftFormState = (): void => {
  resetConnectionsStore();
  useEditorStore.setState({ ...initialEditorState });
};
