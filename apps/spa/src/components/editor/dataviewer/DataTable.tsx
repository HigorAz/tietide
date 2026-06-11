import { memo } from 'react';
import { classifyValue, formatScalar } from './valueFormat';

const CELL_MAX = 60;

/** True only for `{}`-literal objects (mirrors isPlainObject in @tietide/shared template-engine). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** An array is tabular only if it is non-empty and every element is a plain object. */
function asObjectRows(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every(isPlainObject) ? (value as Record<string, unknown>[]) : null;
}

/**
 * Resolve `value` to table rows: the array itself when it's an array of objects,
 * else the first key of an object whose value is an array of objects (the Gmail
 * `{ messages: [...] }` shape). Returns null when nothing is tabular.
 */
export function extractRows(value: unknown): Record<string, unknown>[] | null {
  const direct = asObjectRows(value);
  if (direct !== null) return direct;
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      const rows = asObjectRows(value[key]);
      if (rows !== null) return rows;
    }
  }
  return null;
}

/** Union of keys across all rows, preserving first-seen order. */
function unionColumns(rows: Record<string, unknown>[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

/** Scalars via formatScalar; nested objects/arrays as compact JSON truncated to 60 chars. */
function renderCell(value: unknown): string {
  const kind = classifyValue(value);
  if (kind === 'array' || kind === 'object') {
    const json = JSON.stringify(value);
    return json.length > CELL_MAX ? `${json.slice(0, CELL_MAX)}…` : json;
  }
  return formatScalar(value);
}

/** Stable React key for a row: a string/number `id` field when present, else the index. */
function rowKey(row: Record<string, unknown>, index: number): string | number {
  const id = row.id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  return index;
}

interface RowProps {
  index: number;
  row: Record<string, unknown>;
  columns: string[];
}

const TD = 'border-b border-white/5 px-2 py-1 align-top text-text-primary';

const Row = memo(function Row({ index, row, columns }: RowProps): JSX.Element {
  return (
    <tr>
      <td className={`${TD} text-text-muted`}>{index}</td>
      {columns.map((col) => {
        const has = Object.prototype.hasOwnProperty.call(row, col);
        return (
          <td key={col} className={TD}>
            {has ? renderCell(row[col]) : <span className="text-text-muted">—</span>}
          </td>
        );
      })}
    </tr>
  );
});

export interface DataTableProps {
  value: unknown;
  testId?: string;
}

/** Renders arrays of objects as a real table; non-tabular data gets a fallback note. */
export function DataTable({ value, testId }: DataTableProps): JSX.Element {
  const rows = extractRows(value);
  if (rows === null) {
    return (
      <div
        data-testid="data-table-fallback"
        className="rounded bg-deep-blue/40 px-2 py-3 text-center text-[11.5px] text-text-secondary"
      >
        This data isn&apos;t tabular — switch to Tree or Raw.
      </div>
    );
  }

  const columns = unionColumns(rows);
  const th =
    'border-b border-white/10 px-2 py-1 text-left text-[10px] uppercase tracking-wide text-text-secondary';

  return (
    <div data-testid={testId} className="max-h-80 overflow-auto rounded border border-white/5">
      <table className="w-full border-collapse font-mono text-[11.5px]">
        <thead className="sticky top-0 bg-surface">
          <tr>
            <th className={th}>#</th>
            {columns.map((col) => (
              <th key={col} className={th}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            // Prefer a stable per-row id when the data carries one; otherwise fall
            // back to the array index — safe here because run output is rendered
            // read-only and rows are never reordered or inserted (IN-01).
            <Row key={rowKey(row, i)} index={i} row={row} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
