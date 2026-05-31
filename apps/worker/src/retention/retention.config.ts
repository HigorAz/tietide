/** Default execution-retention window when EXECUTION_RETENTION_DAYS is unset/invalid. */
export const DEFAULT_RETENTION_DAYS = 90;

/** Defensive upper bound so a fat-fingered value can't make the cutoff meaningless. */
export const MAX_RETENTION_DAYS = 3650;

/**
 * Resolve the execution-retention window (days) from a raw env value. Invalid,
 * non-integer, or sub-1 values fall back to the default; anything above the cap
 * is clamped. Keeping this pure makes the policy trivially unit-testable.
 */
export function resolveRetentionDays(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : raw !== undefined && raw !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return DEFAULT_RETENTION_DAYS;
  }
  return Math.min(n, MAX_RETENTION_DAYS);
}
