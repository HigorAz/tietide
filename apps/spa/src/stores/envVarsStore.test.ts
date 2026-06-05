import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/envVars', () => ({
  listUserEnvVars: vi.fn(),
  listAdminEnvVars: vi.fn(),
}));

import * as envApi from '@/api/envVars';
import { useEnvVarsStore } from './envVarsStore';

const mockedUser = vi.mocked(envApi.listUserEnvVars);
const mockedAdmin = vi.mocked(envApi.listAdminEnvVars);

const makeVar = (key: string, scope: 'USER' | 'GLOBAL' = 'USER') => ({
  id: `${scope}-${key}`,
  key,
  scope,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
});

describe('envVarsStore', () => {
  beforeEach(() => {
    useEnvVarsStore.getState().reset();
    mockedUser.mockReset();
    mockedAdmin.mockReset();
  });

  it('merges USER + GLOBAL keys, deduped and sorted', async () => {
    mockedUser.mockResolvedValueOnce([makeVar('ZETA'), makeVar('ALPHA')]);
    mockedAdmin.mockResolvedValueOnce([makeVar('ALPHA', 'GLOBAL'), makeVar('MIDDLE', 'GLOBAL')]);

    await useEnvVarsStore.getState().load();

    expect(useEnvVarsStore.getState().keys).toEqual(['ALPHA', 'MIDDLE', 'ZETA']);
    expect(useEnvVarsStore.getState().status).toBe('ready');
  });

  it('falls back to USER-only when the admin endpoint 403s', async () => {
    mockedUser.mockResolvedValueOnce([makeVar('MY_KEY')]);
    mockedAdmin.mockRejectedValueOnce(new Error('Forbidden'));

    await useEnvVarsStore.getState().load();

    expect(useEnvVarsStore.getState().keys).toEqual(['MY_KEY']);
    expect(useEnvVarsStore.getState().status).toBe('ready');
  });

  it('records an error when the USER endpoint fails', async () => {
    mockedUser.mockRejectedValueOnce(new Error('boom'));

    await useEnvVarsStore.getState().load();

    expect(useEnvVarsStore.getState().status).toBe('error');
    expect(useEnvVarsStore.getState().error).toBe('boom');
  });

  it('is idempotent: a second load() skips the network unless forced', async () => {
    mockedUser.mockResolvedValue([makeVar('A')]);
    mockedAdmin.mockResolvedValue([]);

    await useEnvVarsStore.getState().load();
    await useEnvVarsStore.getState().load();
    expect(mockedUser).toHaveBeenCalledTimes(1);

    await useEnvVarsStore.getState().load(true);
    expect(mockedUser).toHaveBeenCalledTimes(2);
  });
});
