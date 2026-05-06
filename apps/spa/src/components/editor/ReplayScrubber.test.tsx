import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  initialExecutionLiveState,
  useExecutionLiveStore,
  type NodeRunState,
} from '@/stores/executionLiveStore';
import { ReplayScrubber } from './ReplayScrubber';

const runState = (overrides: Partial<NodeRunState> = {}): NodeRunState => ({
  status: 'success',
  nodeType: 'http-request',
  startedAt: '2026-05-06T10:00:00.000Z',
  finishedAt: '2026-05-06T10:00:01.000Z',
  durationMs: 1000,
  input: null,
  output: { ok: true },
  error: null,
  ...overrides,
});

const seedTwoSteps = (): void => {
  useExecutionLiveStore.setState({
    ...initialExecutionLiveState,
    executionId: 'exec-1',
    mode: 'replay',
    nodes: new Map<string, NodeRunState>([
      [
        'a',
        runState({
          startedAt: '2026-05-06T10:00:00.000Z',
          finishedAt: '2026-05-06T10:00:01.000Z',
        }),
      ],
      [
        'b',
        runState({
          startedAt: '2026-05-06T10:00:03.000Z',
          finishedAt: '2026-05-06T10:00:05.000Z',
        }),
      ],
    ]),
  });
};

describe('ReplayScrubber', () => {
  beforeEach(() => {
    useExecutionLiveStore.setState({ ...initialExecutionLiveState, nodes: new Map() });
  });

  describe('visibility', () => {
    it('should not render when no execution is loaded (mode=null, executionId=null)', () => {
      render(<ReplayScrubber />);
      expect(screen.queryByTestId('replay-scrubber')).not.toBeInTheDocument();
    });

    it('should not render in live mode (PENDING/RUNNING execution)', () => {
      useExecutionLiveStore.setState({
        ...initialExecutionLiveState,
        executionId: 'exec-1',
        mode: 'live',
        nodes: new Map<string, NodeRunState>([
          [
            'a',
            runState({
              status: 'running',
              startedAt: '2026-05-06T10:00:00.000Z',
              finishedAt: null,
            }),
          ],
        ]),
      });
      render(<ReplayScrubber />);
      expect(screen.queryByTestId('replay-scrubber')).not.toBeInTheDocument();
    });

    it('should render for terminal executions once steps are hydrated', () => {
      seedTwoSteps();
      render(<ReplayScrubber />);
      expect(screen.getByTestId('replay-scrubber')).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('should not render in replay mode when no steps are hydrated yet', () => {
      useExecutionLiveStore.setState({
        ...initialExecutionLiveState,
        executionId: 'exec-1',
        mode: 'replay',
        nodes: new Map(),
      });
      render(<ReplayScrubber />);
      expect(screen.queryByTestId('replay-scrubber')).not.toBeInTheDocument();
    });
  });

  describe('bounds', () => {
    it('should expose aria-valuemin=0 and aria-valuemax matching the chronological bounds in ms', () => {
      seedTwoSteps();
      render(<ReplayScrubber />);
      const thumb = screen.getByRole('slider');
      expect(thumb).toHaveAttribute('aria-valuemin', '0');
      // 10:00:00 → 10:00:05 = 5000 ms
      expect(thumb).toHaveAttribute('aria-valuemax', '5000');
    });
  });

  describe('scrubbing', () => {
    it('should update viewAtTime when the user nudges the slider with the keyboard', () => {
      seedTwoSteps();
      render(<ReplayScrubber />);

      const thumb = screen.getByRole('slider');
      thumb.focus();
      // Radix Slider listens to ArrowRight on the thumb; fireEvent skips the
      // userEvent + fake-timer interplay that hangs jsdom (CLAUDE.md hurdle #26).
      fireEvent.keyDown(thumb, { key: 'ArrowRight', code: 'ArrowRight' });

      const cursor = useExecutionLiveStore.getState().viewAtTime;
      expect(cursor).not.toBeNull();
      expect(Date.parse(cursor!)).toBeGreaterThanOrEqual(Date.parse('2026-05-06T10:00:00.000Z'));
      expect(Date.parse(cursor!)).toBeLessThanOrEqual(Date.parse('2026-05-06T10:00:05.000Z'));
    });
  });

  describe('play / pause', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('should advance viewAtTime over fake-timer time when Play is pressed', () => {
      seedTwoSteps();
      render(<ReplayScrubber />);

      fireEvent.click(screen.getByRole('button', { name: /play/i }));
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const cursor = useExecutionLiveStore.getState().viewAtTime;
      expect(cursor).not.toBeNull();
      const elapsed = Date.parse(cursor!) - Date.parse('2026-05-06T10:00:00.000Z');
      expect(elapsed).toBeGreaterThanOrEqual(900);
      expect(elapsed).toBeLessThanOrEqual(1100);
    });

    it('should stop advancing when Pause is pressed', () => {
      seedTwoSteps();
      render(<ReplayScrubber />);

      fireEvent.click(screen.getByRole('button', { name: /play/i }));
      act(() => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.click(screen.getByRole('button', { name: /pause/i }));

      const snapshot = useExecutionLiveStore.getState().viewAtTime;
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(useExecutionLiveStore.getState().viewAtTime).toBe(snapshot);
    });

    it('should auto-pause once the playhead reaches the max bound', () => {
      seedTwoSteps();
      render(<ReplayScrubber />);

      fireEvent.click(screen.getByRole('button', { name: /play/i }));
      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      const cursor = useExecutionLiveStore.getState().viewAtTime;
      expect(cursor).toBe('2026-05-06T10:00:05.000Z');
      expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
    });
  });

  describe('cleanup', () => {
    it('should reset viewAtTime to null on unmount', () => {
      seedTwoSteps();
      const view = render(<ReplayScrubber />);

      const thumb = screen.getByRole('slider');
      thumb.focus();
      fireEvent.keyDown(thumb, { key: 'ArrowRight', code: 'ArrowRight' });
      expect(useExecutionLiveStore.getState().viewAtTime).not.toBeNull();

      view.unmount();
      expect(useExecutionLiveStore.getState().viewAtTime).toBeNull();
    });
  });
});
