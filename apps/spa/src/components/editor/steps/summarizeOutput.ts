// Best-effort: the conventional "collection" keys connectors use for their main
// result set. Checked (in order) BEFORE any positional fallback so a shape like
// `{ errors: [], messages: [...50] }` reports the meaningful count, not 0.
const COLLECTION_KEYS = ['items', 'results', 'data', 'messages', 'records'] as const;

/**
 * Derives the "N items" summary shown on the collapsed Test step
 * (`✓ tested · N items`) from arbitrary captured output JSON. Best-effort —
 * object key order is not reliable, so the count is a heuristic.
 *
 * - A top-level array → its length.
 * - A plain object → the length of the first present well-known collection key
 *   (`items`/`results`/`data`/`messages`/`records`), which holds the meaningful
 *   set across most connectors regardless of serialization order.
 * - Anything else (no recognised collection) → the neutral 'output captured',
 *   rather than guessing from an arbitrary first array (which can mislead).
 */
export function summarizeOutput(output: unknown): string {
  if (Array.isArray(output)) return countLabel(output.length);

  if (output !== null && typeof output === 'object') {
    const record = output as Record<string, unknown>;
    for (const key of COLLECTION_KEYS) {
      if (Array.isArray(record[key])) return countLabel((record[key] as unknown[]).length);
    }
  }

  return 'output captured';
}

const countLabel = (n: number): string => `${n} item${n === 1 ? '' : 's'}`;
