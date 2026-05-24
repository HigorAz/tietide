import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, useIsMobile } from './useMediaQuery';
import { mockViewport, restoreViewport } from '@/test/matchMedia';

interface FakeMql {
  matches: boolean;
  media: string;
  listeners: Set<(e: MediaQueryListEvent) => void>;
}

// Builds a controllable matchMedia whose `matches` can be flipped and that
// notifies registered `change` listeners — used to assert the hook re-renders.
const installControllableMatchMedia = (initialMatches: boolean): FakeMql => {
  const state: FakeMql = { matches: initialMatches, media: '', listeners: new Set() };
  window.matchMedia = vi.fn((query: string) => {
    state.media = query;
    return {
      get matches() {
        return state.matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) =>
        state.listeners.add(cb),
      removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) =>
        state.listeners.delete(cb),
      addListener: (cb: (e: MediaQueryListEvent) => void) => state.listeners.add(cb),
      removeListener: (cb: (e: MediaQueryListEvent) => void) => state.listeners.delete(cb),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;
  return state;
};

describe('useMediaQuery', () => {
  afterEach(() => {
    restoreViewport();
    vi.restoreAllMocks();
  });

  it('should return true when the query matches on mount', () => {
    installControllableMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('should return false when the query does not match on mount', () => {
    installControllableMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('should update when a change event fires', () => {
    const state = installControllableMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      state.matches = true;
      state.listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    });

    expect(result.current).toBe(true);
  });

  it('should not throw when matchMedia is unavailable (SSR-safe)', () => {
    const original = window.matchMedia;
    // @ts-expect-error — simulate an environment without matchMedia
    delete window.matchMedia;
    try {
      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
      expect(result.current).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('useIsMobile', () => {
  afterEach(() => {
    restoreViewport();
    vi.restoreAllMocks();
  });

  it('should be false on a desktop viewport', () => {
    mockViewport('desktop');
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('should be true on a mobile viewport', () => {
    mockViewport('mobile');
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});
