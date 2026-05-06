export const OAUTH_REFRESH_QUEUE = 'oauth-refresh';
export const OAUTH_REFRESH_DLQ_QUEUE = 'oauth-refresh-dlq';

export const OAUTH_REFRESH_SCAN_JOB = 'scan';
export const OAUTH_REFRESH_ONE_JOB = 'refresh-one';
export const OAUTH_REFRESH_DLQ_JOB = 'refresh-dlq';

export const OAUTH_REFRESH_SCHEDULER_KEY = 'oauth-refresh-scan';

export const MAX_REFRESH_FAILURES = 3;
export const REFRESH_LEAD_TIME_MS = 5 * 60 * 1000;
export const REFRESH_ATTEMPTS_PER_CYCLE = 3;
export const SCAN_INTERVAL_PATTERN = '*/5 * * * *';
