import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';
import { selectScrubberBounds, useExecutionLiveStore } from '@/stores/executionLiveStore';

const TICK_MS = 50;

const formatOffset = (ms: number): string => {
  if (ms < 1000) return `+${ms} ms`;
  return `+${(ms / 1000).toFixed(2)} s`;
};

export function ReplayScrubber(): JSX.Element | null {
  const executionId = useExecutionLiveStore((s) => s.executionId);
  const mode = useExecutionLiveStore((s) => s.mode);
  const viewAtTime = useExecutionLiveStore((s) => s.viewAtTime);
  const setViewAtTime = useExecutionLiveStore((s) => s.setViewAtTime);
  const bounds = useExecutionLiveStore(selectScrubberBounds);

  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reset the cursor on unmount so a navigation away from `?execution=<id>`
  // returns the editor to its non-replay state. The store reset() in the
  // parent page also covers this; doing it here makes the contract explicit.
  useEffect(() => {
    return () => {
      stopInterval();
      useExecutionLiveStore.getState().setViewAtTime(null);
    };
  }, [stopInterval]);

  // If the bounds disappear (e.g. store reset mid-mount), stop playback.
  useEffect(() => {
    if (!bounds) {
      stopInterval();
      setIsPlaying(false);
    }
  }, [bounds, stopInterval]);

  const totalMs = bounds ? bounds.maxMs - bounds.minMs : 0;
  const currentMs = useMemo(() => {
    if (!bounds) return 0;
    if (viewAtTime === null) return 0;
    const elapsed = Date.parse(viewAtTime) - bounds.minMs;
    if (Number.isNaN(elapsed)) return 0;
    return Math.max(0, Math.min(totalMs, elapsed));
  }, [bounds, viewAtTime, totalMs]);

  const handleValueChange = useCallback(
    (values: number[]) => {
      if (!bounds) return;
      const ms = values[0] ?? 0;
      const clamped = Math.max(0, Math.min(totalMs, ms));
      setViewAtTime(new Date(bounds.minMs + clamped).toISOString());
    },
    [bounds, totalMs, setViewAtTime],
  );

  const handlePlay = useCallback(() => {
    if (!bounds) return;
    if (intervalRef.current !== null) return;
    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      const state = useExecutionLiveStore.getState();
      const currentBounds = selectScrubberBounds(state);
      if (!currentBounds) {
        stopInterval();
        setIsPlaying(false);
        return;
      }
      const span = currentBounds.maxMs - currentBounds.minMs;
      const cursorMs =
        state.viewAtTime === null ? 0 : Date.parse(state.viewAtTime) - currentBounds.minMs;
      const next = Math.min(span, cursorMs + TICK_MS);
      state.setViewAtTime(new Date(currentBounds.minMs + next).toISOString());
      if (next >= span) {
        stopInterval();
        setIsPlaying(false);
      }
    }, TICK_MS);
  }, [bounds, stopInterval]);

  const handlePause = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
  }, [stopInterval]);

  if (mode !== 'replay' || !executionId || !bounds) {
    return null;
  }

  return (
    <div
      data-testid="replay-scrubber"
      className="flex items-center gap-2 border-b border-white/5 px-2 py-1.5"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={isPlaying ? handlePause : handlePlay}
        aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
        className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-accent-teal focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
      >
        {isPlaying ? (
          <Pause aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <Play aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>
      <Slider
        aria-label="Replay timeline"
        min={0}
        max={totalMs}
        step={TICK_MS}
        value={[currentMs]}
        onValueChange={handleValueChange}
        className="flex-1"
      />
      <span
        data-testid="replay-scrubber-offset"
        className="min-w-[3.5rem] text-right text-[10px] tabular-nums text-text-secondary"
      >
        {formatOffset(currentMs)}
      </span>
    </div>
  );
}
