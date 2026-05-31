import { api } from './client';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Fetch every page of a cursor-paginated list endpoint and return the flattened
 * items. The API caps each request server-side (W3.2); the client transparently
 * walks `nextCursor` so callers still receive the full collection without
 * needing pagination UI. The loop is defensively bounded so a misbehaving server
 * cannot spin forever.
 */
export async function fetchAllPages<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 1000; guard++) {
    const search = new URLSearchParams(params);
    if (cursor) search.set('cursor', cursor);
    const qs = search.toString();
    const { data } = await api.get<Page<T>>(`${path}${qs ? `?${qs}` : ''}`);
    all.push(...data.items);
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return all;
}
