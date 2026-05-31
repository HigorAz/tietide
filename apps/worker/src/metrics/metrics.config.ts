/** Default port for the worker's metrics/health HTTP server. */
export const DEFAULT_METRICS_PORT = 9091;

/** Resolve the metrics HTTP port from a raw env value; invalid → default. */
export function resolveMetricsPort(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : raw !== undefined && raw !== '' ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return DEFAULT_METRICS_PORT;
  }
  return n;
}
