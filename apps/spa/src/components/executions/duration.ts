export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes} m` : `${minutes} m ${seconds} s`;
}

export function computeDurationMs(
  startedAt: Date | string | null,
  finishedAt: Date | string | null,
): number | null {
  if (!startedAt || !finishedAt) return null;
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const end = finishedAt instanceof Date ? finishedAt : new Date(finishedAt);
  return end.getTime() - start.getTime();
}
