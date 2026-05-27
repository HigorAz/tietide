import type { DecryptedConnection } from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import type { MicrosoftAuthService } from './microsoft-auth';

export type ExcelMatchMode = 'exact' | 'contains' | 'startsWith';

export interface ExcelRow {
  index?: number;
  values?: unknown[][];
}

type Conn = DecryptedConnection<MicrosoftOAuth2Config>;

// Hard cap on rows scanned per node run so a runaway table can't exhaust memory.
const ROW_SCAN_CAP = 5000;
const PAGE_SIZE = 200;

// Workbook/worksheet/table identifiers are URL-encoded so a crafted name cannot
// rewrite the Graph path. Shared by excel-find-row and excel-update-row.
export const buildTablePath = (workbookId: string, worksheet: string, tableName: string): string =>
  `/v1.0/me/drive/items/${encodeURIComponent(workbookId)}` +
  `/workbook/worksheets('${encodeURIComponent(worksheet)}')` +
  `/tables('${encodeURIComponent(tableName)}')`;

const cellToString = (cell: unknown): string =>
  cell === null || cell === undefined ? '' : String(cell);

// Resolve a header label to its 0-based column index (exact, trimmed match).
// Returns -1 when the column is absent.
export const resolveColumnIndex = (header: unknown[], column: string): number => {
  const target = column.trim();
  return header.findIndex((h) => cellToString(h).trim() === target);
};

export const matchCell = (cell: unknown, target: string, mode: ExcelMatchMode): boolean => {
  const value = cellToString(cell);
  if (mode === 'contains') return value.includes(target);
  if (mode === 'startsWith') return value.startsWith(target);
  return value === target;
};

export const fetchHeaderRow = async (
  auth: MicrosoftAuthService,
  connection: Conn,
  tablePath: string,
): Promise<unknown[]> => {
  const res = await auth.graphFetch<{ values?: unknown[][] }>(
    connection,
    `${tablePath}/headerRowRange`,
  );
  return res.data?.values?.[0] ?? [];
};

// Page through every table row via $skip/$top (the same opaque-cursor technique
// the excel-row-added poll trigger uses), capped at ROW_SCAN_CAP.
export const fetchAllTableRows = async (
  auth: MicrosoftAuthService,
  connection: Conn,
  tablePath: string,
): Promise<ExcelRow[]> => {
  const all: ExcelRow[] = [];
  let skip = 0;
  for (;;) {
    const res = await auth.graphFetch<{ value?: ExcelRow[] }>(
      connection,
      `${tablePath}/rows?$skip=${skip}&$top=${PAGE_SIZE}`,
    );
    const batch = res.data?.value ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE || all.length >= ROW_SCAN_CAP) break;
    skip += PAGE_SIZE;
  }
  return all.slice(0, ROW_SCAN_CAP);
};

export const rowCells = (row: ExcelRow): unknown[] => row.values?.[0] ?? [];
