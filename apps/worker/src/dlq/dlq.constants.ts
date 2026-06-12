export const DLQ_QUEUE_NAME = 'workflow-execution-dlq';
export const DLQ_JOB_NAME = 'failed-execution';
export const MAX_EXECUTION_ATTEMPTS = 3;
export const EXECUTION_BACKOFF_DELAY_MS = 1_000;
export const EXECUTION_BACKOFF_TYPE = 'exponential' as const;
// Retention bound for DLQ records (seconds). DLQ entries hold raw trigger
// payloads; cap their lifetime so failed jobs are not kept forever. 30 days.
export const DLQ_RETENTION_AGE_SECONDS = 30 * 24 * 60 * 60;
