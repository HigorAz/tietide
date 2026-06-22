import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useElementReady } from './useElementReady';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('useElementReady', () => {
  it('is ready immediately for a null target (no active step)', () => {
    const { result } = renderHook(() => useElementReady(null, true));
    expect(result.current).toBe(true);
  });

  it("is ready immediately for the 'body' target (centered step)", () => {
    const { result } = renderHook(() => useElementReady('body', true));
    expect(result.current).toBe(true);
  });

  it('is ready immediately when the target already exists', () => {
    const el = document.createElement('div');
    el.setAttribute('data-tour', 'present');
    document.body.appendChild(el);
    const { result } = renderHook(() => useElementReady('[data-tour="present"]', true));
    expect(result.current).toBe(true);
  });

  it('flips to ready once a missing target appears in the DOM', async () => {
    const { result } = renderHook(() => useElementReady('[data-tour="later"]', true));
    expect(result.current).toBe(false);

    act(() => {
      const el = document.createElement('div');
      el.setAttribute('data-tour', 'later');
      document.body.appendChild(el);
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('falls back to ready after the timeout so the tour never hard-locks', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useElementReady('[data-tour="never"]', true, 1000));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);
  });

  it('does not gate (stays ready) when disabled', () => {
    const { result } = renderHook(() => useElementReady('[data-tour="absent"]', false));
    expect(result.current).toBe(true);
  });
});
