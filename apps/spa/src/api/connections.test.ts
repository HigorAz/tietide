import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionStatus, ConnectionType, ConnectionProvider } from '@tietide/shared';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from './client';
import {
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  startOAuth,
  type ConnectionView,
} from './connections';

const mocked = {
  get: vi.mocked(api.get),
  post: vi.mocked(api.post),
  patch: vi.mocked(api.patch),
  delete: vi.mocked(api.delete),
};

const sampleConnection: ConnectionView = {
  id: 'conn-1',
  type: ConnectionType.API_KEY,
  provider: 'openai',
  name: 'My OpenAI',
  status: ConnectionStatus.ACTIVE,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-05-06T00:00:00Z',
  updatedAt: '2026-05-06T00:00:00Z',
};

describe('connections api', () => {
  beforeEach(() => {
    mocked.get.mockReset();
    mocked.post.mockReset();
    mocked.patch.mockReset();
    mocked.delete.mockReset();
  });

  it('listConnections should GET /connections', async () => {
    mocked.get.mockResolvedValueOnce({ data: [sampleConnection] });
    const result = await listConnections();
    expect(mocked.get).toHaveBeenCalledWith('/connections');
    expect(result).toEqual([sampleConnection]);
  });

  it('getConnection should GET /connections/:id', async () => {
    mocked.get.mockResolvedValueOnce({ data: sampleConnection });
    const result = await getConnection('conn-1');
    expect(mocked.get).toHaveBeenCalledWith('/connections/conn-1');
    expect(result).toEqual(sampleConnection);
  });

  it('createConnection should POST /connections with the body', async () => {
    mocked.post.mockResolvedValueOnce({ data: sampleConnection });
    const body = {
      provider: ConnectionProvider.OPENAI,
      type: ConnectionType.API_KEY,
      name: 'My OpenAI',
      config: { apiKey: 'sk-abc' },
    };
    const result = await createConnection(body);
    expect(mocked.post).toHaveBeenCalledWith('/connections', body);
    expect(result).toEqual(sampleConnection);
  });

  it('updateConnection should PATCH /connections/:id with the partial body', async () => {
    mocked.patch.mockResolvedValueOnce({ data: sampleConnection });
    const result = await updateConnection('conn-1', { name: 'Renamed' });
    expect(mocked.patch).toHaveBeenCalledWith('/connections/conn-1', { name: 'Renamed' });
    expect(result).toEqual(sampleConnection);
  });

  it('deleteConnection should DELETE /connections/:id', async () => {
    mocked.delete.mockResolvedValueOnce({});
    await deleteConnection('conn-1');
    expect(mocked.delete).toHaveBeenCalledWith('/connections/conn-1');
  });

  it('testConnection should POST /connections/:id/test', async () => {
    mocked.post.mockResolvedValueOnce({ data: { ok: true, latencyMs: 142 } });
    const result = await testConnection('conn-1');
    expect(mocked.post).toHaveBeenCalledWith('/connections/conn-1/test');
    expect(result).toEqual({ ok: true, latencyMs: 142 });
  });

  it('startOAuth should GET /connections/oauth/start with provider+label', async () => {
    mocked.get.mockResolvedValueOnce({
      data: { redirectUrl: 'https://provider/auth?state=jwt', state: 'jwt' },
    });
    const result = await startOAuth({ provider: ConnectionProvider.GOOGLE, label: 'My Google' });
    expect(mocked.get).toHaveBeenCalledWith(
      '/connections/oauth/start?provider=google&label=My+Google',
    );
    expect(result.redirectUrl).toBe('https://provider/auth?state=jwt');
  });

  it('startOAuth should include scopes when provided', async () => {
    mocked.get.mockResolvedValueOnce({
      data: { redirectUrl: 'u', state: 's' },
    });
    await startOAuth({
      provider: ConnectionProvider.GOOGLE,
      label: 'g',
      scopes: 'https://www.googleapis.com/auth/drive.readonly',
    });
    const callUrl = mocked.get.mock.calls[0][0] as string;
    expect(callUrl).toContain('scopes=');
  });
});
