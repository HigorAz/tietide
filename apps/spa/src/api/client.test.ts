import { describe, it, expect, beforeEach } from 'vitest';
import type { AxiosError } from 'axios';
import { onResponseRejected } from './client';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const make401 = (): AxiosError => ({ response: { status: 401 } }) as unknown as AxiosError;

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
