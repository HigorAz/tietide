import { parseJsonSample } from '@/lib/parseJsonSample';

/**
 * Coerce a stored `__pillSample` config value into a structured override for the
 * pill catalog. Strings are parsed as JSON (the same tolerant parse the
 * PillSampleField editor uses, so smart quotes etc. agree); already-structured
 * objects/arrays pass through. Empty strings, invalid JSON, and bare primitives
 * yield `undefined` so callers fall back to the node's schema.
 *
 * Shared by the data-pill picker (DataPillPicker) and the referential-integrity
 * validator (validate-references) so a sample that makes a field appear in the
 * picker also makes that field valid — the two never diverge.
 */
export function parsePillSample(raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const result = parseJsonSample(raw);
    return result.ok ? result.value : undefined;
  }
  if (typeof raw === 'object') return raw;
  return undefined;
}
