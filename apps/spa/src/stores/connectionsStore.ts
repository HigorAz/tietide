import { create } from 'zustand';
import {
  listConnections as apiList,
  createConnection as apiCreate,
  deleteConnection as apiDelete,
  updateConnection as apiUpdate,
  testConnection as apiTest,
  startOAuth as apiStartOAuth,
  type ConnectionView,
  type CreateConnectionBody,
  type UpdateConnectionBody,
  type StartOAuthParams,
  type StartOAuthResult,
  type TestConnectionResult,
} from '@/api/connections';

export type ConnectionsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ConnectionsState {
  connections: ConnectionView[];
  status: ConnectionsStatus;
  error: string | null;
  testingIds: Record<string, true>;
  deletingIds: Record<string, true>;
}

export interface ConnectionsActions {
  fetch: () => Promise<void>;
  create: (body: CreateConnectionBody) => Promise<ConnectionView>;
  update: (id: string, body: UpdateConnectionBody) => Promise<ConnectionView>;
  remove: (id: string) => Promise<void>;
  test: (id: string) => Promise<TestConnectionResult>;
  startOAuth: (params: StartOAuthParams) => Promise<StartOAuthResult>;
}

export type ConnectionsStore = ConnectionsState & ConnectionsActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

const initialState: ConnectionsState = {
  connections: [],
  status: 'idle',
  error: null,
  testingIds: {},
  deletingIds: {},
};

export const useConnectionsStore = create<ConnectionsStore>((set, get) => ({
  ...initialState,

  fetch: async () => {
    set({ status: 'loading', error: null });
    try {
      const connections = await apiList();
      set({ connections, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },

  create: async (body) => {
    const created = await apiCreate(body);
    set({ connections: [created, ...get().connections] });
    return created;
  },

  update: async (id, body) => {
    const updated = await apiUpdate(id, body);
    set({
      connections: get().connections.map((c) => (c.id === id ? updated : c)),
    });
    return updated;
  },

  remove: async (id) => {
    set({ deletingIds: { ...get().deletingIds, [id]: true } });
    const previous = get().connections;
    set({ connections: previous.filter((c) => c.id !== id) });
    try {
      await apiDelete(id);
    } catch (err) {
      set({ connections: previous });
      throw err;
    } finally {
      const { [id]: _omit, ...rest } = get().deletingIds;
      void _omit;
      set({ deletingIds: rest });
    }
  },

  test: async (id) => {
    set({ testingIds: { ...get().testingIds, [id]: true } });
    try {
      const result = await apiTest(id);
      if (result.ok) {
        set({
          connections: get().connections.map((c) =>
            c.id === id ? { ...c, lastUsedAt: new Date().toISOString() } : c,
          ),
        });
      }
      return result;
    } finally {
      const { [id]: _omit, ...rest } = get().testingIds;
      void _omit;
      set({ testingIds: rest });
    }
  },

  startOAuth: async (params) => {
    return apiStartOAuth(params);
  },
}));

export const resetConnectionsStore = (): void => {
  useConnectionsStore.setState({ ...initialState });
};
