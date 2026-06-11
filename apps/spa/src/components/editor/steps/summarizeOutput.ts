/**
 * Derives the "N items" summary shown on the collapsed Test step
 * (`✓ tested · N items`) from arbitrary captured output JSON.
 *
 * - A top-level array → its length.
 * - A plain object → the length of its first own array-valued property
 *   (matches the common connector shape, e.g. `{ messages: [...] }`).
 * - Anything else → the neutral 'output captured'.
 */
export function summarizeOutput(output: unknown): string {
  if (Array.isArray(output)) return countLabel(output.length);

  if (output !== null && typeof output === 'object') {
    for (const value of Object.values(output as Record<string, unknown>)) {
      if (Array.isArray(value)) return countLabel(value.length);
    }
  }

  return 'output captured';
}

const countLabel = (n: number): string => `${n} item${n === 1 ? '' : 's'}`;
