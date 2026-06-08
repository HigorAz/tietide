/** Daily job that reports each paid workspace's metered run usage to Stripe. */
export const USAGE_REPORT_QUEUE_NAME = 'billing-usage-report';
export const USAGE_REPORT_JOB_NAME = 'report';
export const USAGE_REPORT_SCHEDULER_ID = 'billing-usage-report-daily';
// 03:00 every day — off-peak; usage is cumulative per period so the exact hour
// is not significant.
export const USAGE_REPORT_CRON = '0 3 * * *';
