const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatRelativeTime(date: Date | string, now: Date = new Date()): string {
  const target = date instanceof Date ? date : new Date(date);
  const diff = target.getTime() - now.getTime();
  const abs = Math.abs(diff);

  if (abs < MINUTE) {
    return formatter.format(Math.round(diff / SECOND), 'second');
  }
  if (abs < HOUR) {
    return formatter.format(Math.round(diff / MINUTE), 'minute');
  }
  if (abs < DAY) {
    return formatter.format(Math.round(diff / HOUR), 'hour');
  }
  if (abs < WEEK) {
    return formatter.format(Math.round(diff / DAY), 'day');
  }
  if (abs < MONTH) {
    return formatter.format(Math.round(diff / WEEK), 'week');
  }
  if (abs < YEAR) {
    return formatter.format(Math.round(diff / MONTH), 'month');
  }
  return formatter.format(Math.round(diff / YEAR), 'year');
}
