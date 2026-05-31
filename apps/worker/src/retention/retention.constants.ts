export const RETENTION_QUEUE = 'execution-retention';

export const RETENTION_SWEEP_JOB = 'sweep';

export const RETENTION_SCHEDULER_KEY = 'execution-retention-sweep';

/** Daily at 03:17 — off the top of the hour to avoid stampeding other schedulers. */
export const RETENTION_INTERVAL_PATTERN = '17 3 * * *';

/** Rows deleted per batch so a sweep never holds one giant transaction/lock. */
export const RETENTION_BATCH_SIZE = 500;

/** Safety cap on batches per run (RETENTION_BATCH_SIZE * this = max rows/run). */
export const RETENTION_MAX_BATCHES = 2000;

/**
 * Only terminal executions are eligible for deletion — never reap PENDING /
 * RUNNING rows, which may still be in flight regardless of age.
 */
export const RETENTION_TERMINAL_STATUSES = ['SUCCESS', 'FAILED', 'CANCELLED', 'SKIPPED'] as const;
