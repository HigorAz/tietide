export const NODE_LIBRARY_COLLAPSE_KEY = 'tietide-node-library-collapsed';

export type NodeLibraryCollapsedState = Record<string, boolean>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readCollapsedState = (): NodeLibraryCollapsedState => {
  try {
    const raw = localStorage.getItem(NODE_LIBRARY_COLLAPSE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return {};
    const out: NodeLibraryCollapsedState = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
};

export const writeCollapsedState = (state: NodeLibraryCollapsedState): void => {
  try {
    localStorage.setItem(NODE_LIBRARY_COLLAPSE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable / quota exhausted — degrade silently.
  }
};
