import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/stores/toastStore';
import { useCopy } from './useCopy';

describe('useCopy', () => {
  let show: ReturnType<typeof vi.fn>;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    show = vi.fn();
    // Zustand spy pattern (hurdle 23): replace the action on the store itself so
    // selector-based subscriptions still read the mock.
    useToastStore.setState({ show });
  });

  afterEach(() => {
    Object.assign(navigator, { clipboard: originalClipboard });
    vi.restoreAllMocks();
    useToastStore.setState({ show: useToastStore.getState().show });
  });

  it('writes to the clipboard and confirms with a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { result } = renderHook(() => useCopy());
    await result.current('{{steps.x.id}}', 'value');

    expect(writeText).toHaveBeenCalledWith('{{steps.x.id}}');
    expect(show).toHaveBeenCalledWith({ tone: 'success', message: 'Copied value' });
  });

  it('shows an error toast when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    const { result } = renderHook(() => useCopy());
    await expect(result.current('x', 'path')).resolves.toBeUndefined();

    expect(show).toHaveBeenCalledWith({
      tone: 'error',
      message: 'Copy failed',
    });
  });

  it('shows an error toast when the clipboard API is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined });

    const { result } = renderHook(() => useCopy());
    await expect(result.current('x', 'path')).resolves.toBeUndefined();

    expect(show).toHaveBeenCalledWith({
      tone: 'error',
      message: 'Copy failed — clipboard unavailable',
    });
  });
});
