/**
 * Worker concurrency resolution.
 *
 * The `workflow-execution` BullMQ processor defaulted to BullMQ's concurrency
 * of 1 — so the worker processed one job at a time despite the docs claiming 5.
 * This makes it env-driven (`WORKER_CONCURRENCY`) with a safe default and a
 * sanity cap.
 */

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const DEFAULT_WORKER_CONCURRENCY = 5;
export const MIN_WORKER_CONCURRENCY = 1;
/** Sanity ceiling — guards against a typo (e.g. 100000) exhausting DB/connection pools. */
export const MAX_WORKER_CONCURRENCY = 100;

export function resolveWorkerConcurrency(env: Env = process.env): number {
  const raw = env.WORKER_CONCURRENCY;
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_WORKER_CONCURRENCY;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_WORKER_CONCURRENCY) {
    return DEFAULT_WORKER_CONCURRENCY;
  }

  return Math.min(parsed, MAX_WORKER_CONCURRENCY);
}
