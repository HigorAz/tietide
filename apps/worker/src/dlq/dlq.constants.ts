export const DLQ_QUEUE_NAME = 'workflow-execution-dlq';
export const DLQ_JOB_NAME = 'failed-execution';
export const MAX_EXECUTION_ATTEMPTS = 3;
export const EXECUTION_BACKOFF_DELAY_MS = 1_000;
export const EXECUTION_BACKOFF_TYPE = 'exponential' as const;
