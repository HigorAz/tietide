import { encodeKeysetCursor, type KeysetCursor } from './cursor';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type SortDirection = 'asc' | 'desc';

/**
 * Build a keyset where-fragment for `(sortField <dir>, id <dir>)` from a decoded
 * cursor. Returned loosely-typed so each service can splice it into its strongly
 * typed Prisma `where` via an `AND`. `value` is the comparison value for
 * `sortField` (a `Date` for date columns, a string for name/key columns).
 */
export function keysetWhere(
  sortField: string,
  direction: SortDirection,
  value: unknown,
  id: string,
): Record<string, unknown> {
  const op = direction === 'desc' ? 'lt' : 'gt';
  return {
    OR: [{ [sortField]: { [op]: value } }, { AND: [{ [sortField]: value }, { id: { [op]: id } }] }],
  };
}

/**
 * Build a page from rows fetched with `take = limit + 1` (the "+1" is the peek
 * that tells us whether another page exists). Slices to the page size, maps each
 * row to a response item, and derives `nextCursor` from the last kept row.
 */
export function buildPage<TRow, TItem>(
  peeked: TRow[],
  limit: number,
  toItem: (row: TRow) => TItem,
  toCursor: (row: TRow) => KeysetCursor,
): Page<TItem> {
  const hasMore = peeked.length > limit;
  const rows = hasMore ? peeked.slice(0, limit) : peeked;
  const lastRow = rows[rows.length - 1];
  const nextCursor = hasMore && lastRow ? encodeKeysetCursor(toCursor(lastRow)) : null;
  return { items: rows.map(toItem), nextCursor };
}
