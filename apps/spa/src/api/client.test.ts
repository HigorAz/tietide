import { describe, it, expect, beforeEach } from 'vitest';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { AxiosHeaders } from 'axios';
import { onResponseRejected, attachRequestHeaders } from './client';
import { useAuthStore, ACTIVE_ORG_STORAGE_KEY } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const make401 = (): AxiosError => ({ response: { status: 401 } }) as unknown as AxiosError;
const make403 = (message: string): AxiosError =>
  ({ response: { status: 403, data: { message } } }) as unknown as AxiosError;
const emptyConfig = (): InternalAxiosRequestConfig =>
  ({ headers: new AxiosHeaders() }) as InternalAxiosRequestConfig;

describe('client 401 interceptor (onResponseRejected)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null, hydrated: true });
    useToastStore.setState({ toasts: [] });
    localStorage.clear();
  });

  it('soft-logs-out and toasts on a 401 for an authenticated session (no hard reload)', async () => {
    localStorage.setItem('tietide-token', 'jwt-123');
    useAuthStore.setState({ token: 'jwt-123', user: null, hydrated: true });

    await expect(onResponseRejected(make401())).rejects.toBeTruthy();

    // Token cleared via the store (ProtectedRoute will then redirect reactively).
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem('tietide-token')).toBeNull();
    // A session-expired toast was surfaced.
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.tone).toBe('error');
    expect(toasts[0]?.message).toMatch(/session has expired/i);
  });

  it('rejects with the original error so callers still see the failure', async () => {
    useAuthStore.setState({ token: 'jwt-123', hydrated: true });
    const err = make401();

    await expect(onResponseRejected(err)).rejects.toBe(err);
  });

  it('does not toast or logout on a 401 when there is no active session (e.g. failed login)', async () => {
    const err = make401();

    await expect(onResponseRejected(err)).rejects.toBe(err);

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('ignores non-401 errors', async () => {
    useAuthStore.setState({ token: 'jwt-123', hydrated: true });
    const err = { response: { status: 500 } } as unknown as AxiosError;

    await expect(onResponseRejected(err)).rejects.toBe(err);

    expect(useAuthStore.getState().token).toBe('jwt-123');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe('client request headers (attachRequestHeaders)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('attaches the bearer token and X-Org-Id from localStorage', () => {
    localStorage.setItem('tietide-token', 'jwt-abc');
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, 'org-9');

    const config = attachRequestHeaders(emptyConfig());

    expect(config.headers.Authorization).toBe('Bearer jwt-abc');
    expect(config.headers['X-Org-Id']).toBe('org-9');
  });

  it('omits X-Org-Id when no active workspace is set', () => {
    localStorage.setItem('tietide-token', 'jwt-abc');

    const config = attachRequestHeaders(emptyConfig());

    expect(config.headers['X-Org-Id']).toBeUndefined();
  });
});

describe('client 403 org-access interceptor', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'jwt-123',
      user: null,
      organizations: [
        { id: 'a', name: 'A', slug: 'a', role: 'MEMBER' },
        { id: 'b', name: 'B', slug: 'b', role: 'MEMBER' },
      ],
      activeOrganization: { id: 'a', name: 'A', slug: 'a', role: 'MEMBER' },
      hydrated: true,
    });
    useToastStore.setState({ toasts: [] });
    localStorage.clear();
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, 'a');
  });

  it('drops the active workspace and toasts on a membership-loss 403', async () => {
    await expect(
      onResponseRejected(make403('Not a member of this organization')),
    ).rejects.toBeTruthy();

    expect(useAuthStore.getState().activeOrganization?.id).toBe('b');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toMatch(/access to that workspace/i);
  });

  it('leaves the workspace alone for an ordinary role 403 (not a membership loss)', async () => {
    await expect(
      onResponseRejected(make403('Insufficient organization role')),
    ).rejects.toBeTruthy();

    expect(useAuthStore.getState().activeOrganization?.id).toBe('a');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe('client 402 plan-limit interceptor', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'jwt-123', user: null, hydrated: true });
    useToastStore.setState({ toasts: [] });
  });

  const make402 = (reason?: string): AxiosError =>
    ({ response: { status: 402, data: reason ? { reason } : {} } }) as unknown as AxiosError;

  it('toasts a targeted upgrade prompt keyed by the reason', async () => {
    await expect(onResponseRejected(make402('seats'))).rejects.toBeTruthy();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.tone).toBe('error');
    expect(toasts[0]?.message).toMatch(/seat limit/i);
  });

  it('falls back to a generic upgrade message for an unknown reason', async () => {
    await expect(onResponseRejected(make402())).rejects.toBeTruthy();

    expect(useToastStore.getState().toasts[0]?.message).toMatch(/upgrade your plan/i);
  });
});
