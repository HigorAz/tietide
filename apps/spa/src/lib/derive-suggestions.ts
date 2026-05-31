// Derive data-pill paths from a runtime sample value (live execution output or a
// curated example). This is the sample-data analog of `walkSchema` in
// upstream-schema.ts and intentionally mirrors its path conventions so pills
// derived from samples and from Zod schemas are interchangeable:
//   - nested object keys join with dots (`user.email`)
//   - array elements use `.0` (`items.0.id`)
//   - an empty object collapses to a single `object` entry
//   - recursion is capped at MAX_DEPTH levels

const MAX_DEPTH = 4;

export interface DerivedPath {
  path: string;
  type: string;
}

export function derivePathsFromSample(sample: unknown, prefix = '', depth = 0): DerivedPath[] {
  if (depth > MAX_DEPTH) return [];

  if (Array.isArray(sample)) {
    const childPath = prefix ? `${prefix}.0` : '0';
    if (sample.length === 0) {
      return [{ path: childPath, type: 'array-element' }];
    }
    const childEntries = derivePathsFromSample(sample[0], childPath, depth + 1);
    return childEntries.length === 0 ? [{ path: childPath, type: 'array-element' }] : childEntries;
  }

  if (sample !== null && typeof sample === 'object') {
    const out: DerivedPath[] = [];
    for (const [key, child] of Object.entries(sample as Record<string, unknown>)) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      out.push(...derivePathsFromSample(child, childPath, depth + 1));
    }
    if (out.length === 0 && prefix) {
      out.push({ path: prefix, type: 'object' });
    }
    return out;
  }

  // Primitive / null leaf. Drop a bare null/undefined at the root (nothing to
  // reference), matching how buildPreviewScope ignores empty live outputs.
  if (sample === undefined) return [];
  if (sample === null && !prefix) return [];
  const type = sample === null ? 'null' : typeof sample;
  return [{ path: prefix, type }];
}
