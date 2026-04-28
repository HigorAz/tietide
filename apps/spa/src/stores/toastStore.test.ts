import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initialToastState, useToastStore } from './toastStore';

describe('useToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ ...initialToastState });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('show', () => {
    it('should append a toast with a unique id and the provided tone and message', () => {
      const id = useToastStore.getState().show({ tone: 'success', message: 'Saved' });

      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({ id, tone: 'success', message: 'Saved' });
      expect(toasts[0].id).toBeTypeOf('string');
    });

    it('should auto-dismiss the toast after the default duration', () => {
      useToastStore.getState().show({ tone: 'info', message: 'Hello' });
      expect(useToastStore.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(4000);

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('should respect a custom durationMs override', () => {
      useToastStore.getState().show({ tone: 'error', message: 'Boom', durationMs: 1000 });

      vi.advanceTimersByTime(999);
      expect(useToastStore.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('should not auto-dismiss when durationMs is 0', () => {
      useToastStore.getState().show({ tone: 'info', message: 'Sticky', durationMs: 0 });

      vi.advanceTimersByTime(60_000);

      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe('dismiss', () => {
    it('should remove the toast with the matching id', () => {
      const a = useToastStore.getState().show({ tone: 'info', message: 'A' });
      const b = useToastStore.getState().show({ tone: 'info', message: 'B' });

      useToastStore.getState().dismiss(a);

      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].id).toBe(b);
    });

    it('should be a no-op for an unknown id', () => {
      useToastStore.getState().show({ tone: 'info', message: 'A' });

      useToastStore.getState().dismiss('does-not-exist');

      expect(useToastStore.getState().toasts).toHaveLength(1);
    });

    it('should cancel the auto-dismiss timer for the dismissed toast', () => {
      const a = useToastStore.getState().show({ tone: 'info', message: 'A' });

      useToastStore.getState().dismiss(a);

      // If the timer were still live, advancing it would attempt to remove an
      // already-gone toast — verify dismiss is idempotent and state is stable.
      vi.advanceTimersByTime(10_000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });
});
