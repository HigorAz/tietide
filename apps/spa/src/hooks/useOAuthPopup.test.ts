import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ConnectionProvider } from '@tietide/shared';

vi.mock('@/api/connections', () => ({
  startOAuth: vi.fn(),
}));

import * as connectionsApi from '@/api/connections';
import { useOAuthPopup } from './useOAuthPopup';

const mockedStartOAuth = vi.mocked(connectionsApi.startOAuth);

interface FakePopup {
  closed: boolean;
  location: { href: string };
  close: () => void;
}

const makeFakePopup = (): FakePopup => ({
  closed: false,
  location: { href: '' },
  close() {
    this.closed = true;
  },
});

describe('useOAuthPopup', () => {
  let popup: FakePopup;
  const openMock = vi.fn<(...args: unknown[]) => Window | null>();
  const originalOpen = window.open;

  beforeEach(() => {
    vi.useFakeTimers();
    popup = makeFakePopup();
    openMock.mockReset();
    openMock.mockImplementation(() => popup as unknown as Window);
    window.open = openMock as unknown as typeof window.open;
    mockedStartOAuth.mockReset();
  });

  afterEach(() => {
    window.open = originalOpen;
    vi.useRealTimers();
  });

  it('should open the popup synchronously BEFORE awaiting the start API (popup-blocker safe)', async () => {
    let resolveStart: (v: { redirectUrl: string; state: string }) => void;
    mockedStartOAuth.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveStart = r;
        }),
    );

    const { result } = renderHook(() => useOAuthPopup());

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.start({
        provider: ConnectionProvider.GOOGLE,
        label: 'My Google',
      });
    });

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock.mock.calls[0][0]).toBe('about:blank');
    expect(mockedStartOAuth).toHaveBeenCalled();
    expect(popup.location.href).toBe('');

    await act(async () => {
      resolveStart!({ redirectUrl: 'https://provider/auth', state: 'jwt' });
      await Promise.resolve();
    });

    expect(popup.location.href).toBe('https://provider/auth');

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { type: 'tietide:oauth:done', status: 'success', connectionId: 'c-1' },
        }),
      );
    });

    await expect(pending!).resolves.toEqual({ status: 'success', connectionId: 'c-1' });
  });

  it('should resolve with error status when the popup posts an error message', async () => {
    mockedStartOAuth.mockResolvedValue({ redirectUrl: 'https://x', state: 's' });
    const { result } = renderHook(() => useOAuthPopup());

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.start({
        provider: ConnectionProvider.GOOGLE,
        label: 'g',
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { type: 'tietide:oauth:done', status: 'error', message: 'access_denied' },
        }),
      );
    });

    await expect(pending!).resolves.toEqual({ status: 'error', message: 'access_denied' });
  });

  it('should ignore messages from the wrong origin', async () => {
    mockedStartOAuth.mockResolvedValue({ redirectUrl: 'https://x', state: 's' });
    const { result } = renderHook(() => useOAuthPopup());

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.start({ provider: ConnectionProvider.GOOGLE, label: 'g' });
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Wrong-origin message — should be ignored.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example',
          data: { type: 'tietide:oauth:done', status: 'success' },
        }),
      );
    });

    // Now simulate popup close — should yield cancelled (proves the bad message did not resolve).
    // 500ms interval tick detects closed; then a 250ms grace period waits for a late
    // success postMessage before declaring cancellation.
    popup.closed = true;
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    await expect(pending!).resolves.toEqual({ status: 'cancelled' });
  });

  it('should resolve with cancelled when the popup is closed manually', async () => {
    mockedStartOAuth.mockResolvedValue({ redirectUrl: 'https://x', state: 's' });
    const { result } = renderHook(() => useOAuthPopup());

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.start({ provider: ConnectionProvider.GOOGLE, label: 'g' });
    });
    await act(async () => {
      await Promise.resolve();
    });

    popup.closed = true;
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    await expect(pending!).resolves.toEqual({ status: 'cancelled' });
  });

  it('should still resolve with success when a postMessage arrives within the close-grace window (race fix)', async () => {
    // Repro: Microsoft Entra closes the popup very fast after firing the
    // success event. The 500ms interval poll can detect popup.closed before
    // the message listener runs, which used to false-fire "cancelled".
    mockedStartOAuth.mockResolvedValue({ redirectUrl: 'https://x', state: 's' });
    const { result } = renderHook(() => useOAuthPopup());

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.start({ provider: ConnectionProvider.MICROSOFT, label: 'ms' });
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Popup closes; interval tick schedules cancellation after a grace period.
    popup.closed = true;
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Inside the grace window, the success postMessage arrives. It must win.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: {
            type: 'tietide:oauth:done',
            status: 'success',
            connectionId: 'race-fix',
          },
        }),
      );
    });

    // Advance past when the grace cancel would have fired.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await expect(pending!).resolves.toEqual({ status: 'success', connectionId: 'race-fix' });
  });

  it('should resolve via BroadcastChannel when window.opener was severed by COOP', async () => {
    // Real timers needed: BroadcastChannel delivery is microtask-async.
    vi.useRealTimers();
    mockedStartOAuth.mockResolvedValue({ redirectUrl: 'https://x', state: 's' });
    const { result } = renderHook(() => useOAuthPopup());

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.start({
        provider: ConnectionProvider.GOOGLE,
        label: 'g',
      });
    });
    // Let the synchronous setup (startOAuth resolution + listener registration) flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Simulate the popup (which has lost window.opener) broadcasting its outcome.
    const sender = new BroadcastChannel('tietide-oauth');
    sender.postMessage({
      type: 'tietide:oauth:done',
      status: 'success',
      connectionId: 'broadcast-id',
    });
    sender.close();

    await expect(pending!).resolves.toEqual({ status: 'success', connectionId: 'broadcast-id' });
  });

  it('should fall back to same-window redirect when window.open returns null (popup blocked)', async () => {
    openMock.mockReturnValueOnce(null);
    mockedStartOAuth.mockResolvedValue({ redirectUrl: 'https://x/auth', state: 's' });
    const originalLocation = window.location;
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: assignMock, origin: originalLocation.origin },
    });

    const { result } = renderHook(() => useOAuthPopup());

    const outcome = await result.current.start({
      provider: ConnectionProvider.GOOGLE,
      label: 'g',
    });

    expect(assignMock).toHaveBeenCalledWith('https://x/auth');
    expect(outcome.status).toBe('error');

    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });
});
