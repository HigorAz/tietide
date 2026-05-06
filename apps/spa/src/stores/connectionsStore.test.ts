import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionStatus, ConnectionType, ConnectionProvider } from '@tietide/shared';

vi.mock('@/api/connections', () => ({
  listConnections: vi.fn(),
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  deleteConnection: vi.fn(),
  testConnection: vi.fn(),
  startOAuth: vi.fn(),
}));

import * as connectionsApi from '@/api/connections';
import {
  useConnectionsStore,
  resetConnectionsStore,
  type ConnectionsStore,
} from './connectionsStore';

const mockedList = vi.mocked(connectionsApi.listConnections);
const mockedCreate = vi.mocked(connectionsApi.createConnection);
const mockedUpdate = vi.mocked(connectionsApi.updateConnection);
const mockedDelete = vi.mocked(connectionsApi.deleteConnection);
const mockedTest = vi.mocked(connectionsApi.testConnection);
const mockedStartOAuth = vi.mocked(connectionsApi.startOAuth);

const makeConn = (
  overrides: Partial<connectionsApi.ConnectionView> = {},
): connectionsApi.ConnectionView => ({
  id: 'c-1',
  type: ConnectionType.API_KEY,
  provider: 'openai',
  name: 'OpenAI',
  status: ConnectionStatus.ACTIVE,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-05-06T00:00:00Z',
  updatedAt: '2026-05-06T00:00:00Z',
  ...overrides,
});

const getState = (): ConnectionsStore => useConnectionsStore.getState();

describe('connectionsStore', () => {
  beforeEach(() => {
    resetConnectionsStore();
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedDelete.mockReset();
    mockedTest.mockReset();
    mockedStartOAuth.mockReset();
  });

  describe('fetch', () => {
    it('should populate connections and set status=ready on success', async () => {
      const rows = [makeConn({ id: 'a' }), makeConn({ id: 'b' })];
      mockedList.mockResolvedValueOnce(rows);

      await getState().fetch();

      expect(getState().connections).toEqual(rows);
      expect(getState().status).toBe('ready');
      expect(getState().error).toBeNull();
    });

    it('should set status=error on failure', async () => {
      mockedList.mockRejectedValueOnce(new Error('network down'));

      await getState().fetch();

      expect(getState().status).toBe('error');
      expect(getState().error).toBe('network down');
    });
  });

  describe('create', () => {
    it('should prepend the new connection and return it', async () => {
      useConnectionsStore.setState({
        connections: [makeConn({ id: 'existing' })],
        status: 'ready',
      });
      const created = makeConn({ id: 'new' });
      mockedCreate.mockResolvedValueOnce(created);

      const result = await getState().create({
        provider: ConnectionProvider.OPENAI,
        type: ConnectionType.API_KEY,
        name: 'New',
        config: { apiKey: 'sk-abc' },
      });

      expect(result).toEqual(created);
      expect(getState().connections.map((c) => c.id)).toEqual(['new', 'existing']);
    });
  });

  describe('update', () => {
    it('should replace the row in place', async () => {
      useConnectionsStore.setState({
        connections: [makeConn({ id: 'a', name: 'Old' }), makeConn({ id: 'b' })],
        status: 'ready',
      });
      const updated = makeConn({ id: 'a', name: 'New' });
      mockedUpdate.mockResolvedValueOnce(updated);

      await getState().update('a', { name: 'New' });

      const row = getState().connections.find((c) => c.id === 'a');
      expect(row?.name).toBe('New');
    });
  });

  describe('remove', () => {
    it('should optimistically remove and clear the deleting flag on success', async () => {
      useConnectionsStore.setState({
        connections: [makeConn({ id: 'a' }), makeConn({ id: 'b' })],
        status: 'ready',
      });
      mockedDelete.mockResolvedValueOnce();

      await getState().remove('a');

      expect(getState().connections.map((c) => c.id)).toEqual(['b']);
      expect(getState().deletingIds.a).toBeUndefined();
    });

    it('should restore the list when the API call fails', async () => {
      useConnectionsStore.setState({
        connections: [makeConn({ id: 'a' })],
        status: 'ready',
      });
      mockedDelete.mockRejectedValueOnce(new Error('forbidden'));

      await expect(getState().remove('a')).rejects.toThrow('forbidden');

      expect(getState().connections.map((c) => c.id)).toEqual(['a']);
      expect(getState().deletingIds.a).toBeUndefined();
    });
  });

  describe('test', () => {
    it('should set lastUsedAt on success and clear the testing flag', async () => {
      useConnectionsStore.setState({
        connections: [makeConn({ id: 'a' })],
        status: 'ready',
      });
      mockedTest.mockResolvedValueOnce({ ok: true, latencyMs: 80 });

      const result = await getState().test('a');

      expect(result).toEqual({ ok: true, latencyMs: 80 });
      const row = getState().connections.find((c) => c.id === 'a');
      expect(row?.lastUsedAt).not.toBeNull();
      expect(getState().testingIds.a).toBeUndefined();
    });

    it('should NOT mutate any row when ok=false', async () => {
      useConnectionsStore.setState({
        connections: [makeConn({ id: 'a', lastUsedAt: null, status: ConnectionStatus.ACTIVE })],
        status: 'ready',
      });
      mockedTest.mockResolvedValueOnce({ ok: false, message: 'unauthorized', latencyMs: 50 });

      const result = await getState().test('a');

      expect(result.ok).toBe(false);
      const row = getState().connections.find((c) => c.id === 'a');
      expect(row?.lastUsedAt).toBeNull();
      expect(row?.status).toBe(ConnectionStatus.ACTIVE);
    });
  });

  describe('startOAuth', () => {
    it('should delegate to the api and return its result', async () => {
      mockedStartOAuth.mockResolvedValueOnce({ redirectUrl: 'https://x', state: 'jwt' });

      const result = await getState().startOAuth({
        provider: ConnectionProvider.GOOGLE,
        label: 'My Google',
      });

      expect(result.redirectUrl).toBe('https://x');
      expect(mockedStartOAuth).toHaveBeenCalledWith({
        provider: ConnectionProvider.GOOGLE,
        label: 'My Google',
      });
    });
  });
});
