import { buildPage, keysetWhere } from './paginate';
import { resolveLimit, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from './page-query.dto';
import { decodeKeysetCursor } from './cursor';

describe('resolveLimit', () => {
  it('defaults when absent', () => {
    expect(resolveLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
  });
  it('defaults on invalid (<1 / non-integer)', () => {
    expect(resolveLimit(0)).toBe(DEFAULT_PAGE_LIMIT);
    expect(resolveLimit(-5)).toBe(DEFAULT_PAGE_LIMIT);
    expect(resolveLimit(1.5)).toBe(DEFAULT_PAGE_LIMIT);
  });
  it('clamps to the maximum', () => {
    expect(resolveLimit(10_000)).toBe(MAX_PAGE_LIMIT);
  });
  it('passes a valid in-range limit through', () => {
    expect(resolveLimit(25)).toBe(25);
  });
});

describe('buildPage', () => {
  const rows = [
    { id: 'a', createdAt: new Date('2026-03-03T00:00:00Z') },
    { id: 'b', createdAt: new Date('2026-03-02T00:00:00Z') },
    { id: 'c', createdAt: new Date('2026-03-01T00:00:00Z') },
  ];
  const toCursor = (r: (typeof rows)[number]) => ({ v: r.createdAt.toISOString(), id: r.id });

  it('returns all rows with a null cursor when not over the limit', () => {
    const page = buildPage(rows.slice(0, 2), 2, (r) => r.id, toCursor);
    expect(page.items).toEqual(['a', 'b']);
    expect(page.nextCursor).toBeNull();
  });

  it('slices off the peek row and emits a cursor pointing at the last kept row', () => {
    const page = buildPage(rows, 2, (r) => r.id, toCursor);
    expect(page.items).toEqual(['a', 'b']);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeKeysetCursor(page.nextCursor as string)).toEqual({
      v: '2026-03-02T00:00:00.000Z',
      id: 'b',
    });
  });
});

describe('keysetWhere', () => {
  it('uses lt for descending order', () => {
    expect(keysetWhere('createdAt', 'desc', 'V', 'id-1')).toEqual({
      OR: [{ createdAt: { lt: 'V' } }, { AND: [{ createdAt: 'V' }, { id: { lt: 'id-1' } }] }],
    });
  });
  it('uses gt for ascending order', () => {
    expect(keysetWhere('name', 'asc', 'V', 'id-1')).toEqual({
      OR: [{ name: { gt: 'V' } }, { AND: [{ name: 'V' }, { id: { gt: 'id-1' } }] }],
    });
  });
});
