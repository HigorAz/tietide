import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore';

const fireKey = (key: string): boolean => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  const dispatched = window.dispatchEvent(event);
  return event.defaultPrevented || !dispatched;
};

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    useOnboardingStore.setState(initialOnboardingState);
  });

  it('should toggle the cheat sheet open when F8 is pressed', () => {
    renderHook(() => useGlobalShortcuts());
    act(() => {
      fireKey('F8');
    });
    expect(useOnboardingStore.getState().cheatSheetOpen).toBe(true);
  });

  it('should toggle the cheat sheet closed when F8 is pressed again', () => {
    renderHook(() => useGlobalShortcuts());
    act(() => {
      fireKey('F8');
    });
    act(() => {
      fireKey('F8');
    });
    expect(useOnboardingStore.getState().cheatSheetOpen).toBe(false);
  });

  it('should call preventDefault on F8 so the browser does not steal the shortcut', () => {
    renderHook(() => useGlobalShortcuts());
    const event = new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it('should ignore keys other than F8', () => {
    renderHook(() => useGlobalShortcuts());
    act(() => {
      fireKey('F7');
      fireKey('Escape');
      fireKey('a');
    });
    expect(useOnboardingStore.getState().cheatSheetOpen).toBe(false);
  });

  it('should remove the listener on unmount', () => {
    const { unmount } = renderHook(() => useGlobalShortcuts());
    unmount();
    act(() => {
      fireKey('F8');
    });
    expect(useOnboardingStore.getState().cheatSheetOpen).toBe(false);
  });
});
