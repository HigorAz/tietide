// W5.15 — engine-enforced per-node wall-clock timeout.
//
// The runner awaits each node's executor with no upstream budget: http-request and
// code self-impose ~30s, but database connectors set only connectTimeout, so a
// `SELECT pg_sleep(3600)` / `SELECT SLEEP(3600)` blocks one of the worker's 5
// concurrent slots for the full hour. Five such runs starve the worker and queue
// every other tenant's executions indefinitely. We wrap every executor.execute in a
// Promise.race against a configurable wall-clock deadline so an overrunning node is
// abandoned and recorded as a FAILED (retryable) step rather than holding the slot.

const DEFAULT_NODE_TIMEOUT_MS = 60_000;

export class NodeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Node execution timed out after ${timeoutMs}ms`);
    this.name = 'NodeTimeoutError';
  }
}

// Resolved once from the environment; an explicit setNodeTimeoutMs override (used by
// tests) takes precedence. A non-positive / unparseable value falls back to the
// default so a misconfigured env can never disable the guard.
let overrideMs: number | undefined;

export function setNodeTimeoutMs(ms: number | undefined): void {
  overrideMs = ms;
}

export function resolveNodeTimeoutMs(): number {
  if (typeof overrideMs === 'number' && overrideMs > 0) return overrideMs;
  const raw = process.env.NODE_EXECUTION_TIMEOUT_MS;
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_NODE_TIMEOUT_MS;
}

/**
 * Race a node-execution promise against the configured wall-clock budget. If the
 * budget elapses first the returned promise rejects with NodeTimeoutError; the
 * underlying work is abandoned (the runner's catch records the step FAILED/retryable).
 * The timer is always cleared so a fast-settling node leaves no dangling handle.
 */
export async function withNodeTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new NodeTimeoutError(timeoutMs)), timeoutMs);
    // Do not keep the event loop alive solely for this timer.
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as { unref: () => void }).unref();
    }
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
