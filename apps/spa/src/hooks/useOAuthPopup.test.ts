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
    popup.closed = true;
    await act(async () => {
      vi.advanceTimersByTime(600);
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
      vi.advanceTimersByTime(600);
    });

    await expect(pending!).resolves.toEqual({ status: 'cancelled' });
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
