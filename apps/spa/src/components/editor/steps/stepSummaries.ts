import { PILL_SAMPLE_KEY } from '@tietide/shared';

/**
 * Summary line for the collapsed Connection step.
 * Priority: stale (unresolved saved id) → selected → optional-empty → required-empty.
 */
export function connectionSummary(
  selected: { name: string; status: string } | null,
  meta: { optional: boolean; stale: boolean },
): string {
  if (meta.stale) return 'Connection unavailable';
  if (selected) return `${selected.name} · ${selected.status.toLowerCase()}`;
  if (meta.optional) return 'No authentication';
  return 'Choose a connection';
}

// Config keys that are not user-facing "fields": the connection lives in step 1,
// the toggles are presentation/dry-run flags, and the pill sample is internal.
const NON_FIELD_KEYS = new Set<string>([
  'connectionId',
  'hasErrorHandler',
  'mockOnDryRun',
  PILL_SAMPLE_KEY,
]);

const isConfigured = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  return true; // 0 and false are meaningful set values
};

/** Summary line for the collapsed Configure step — counts, never values (T-02-04). */
export function configureSummary(config: Record<string, unknown>): string {
  let count = 0;
  for (const key of Object.keys(config)) {
    if (NON_FIELD_KEYS.has(key)) continue;
    if (isConfigured(config[key])) count += 1;
  }
  if (count === 0) return 'Using defaults';
  return `${count} field${count === 1 ? '' : 's'} configured`;
}
