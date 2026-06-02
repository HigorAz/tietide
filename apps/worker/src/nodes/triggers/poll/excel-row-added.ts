import { Injectable } from '@nestjs/common';
import {
  BasePollTrigger,
  type DecryptedConnection,
  type PollContext,
  type PollResult,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { GraphHttpError, MicrosoftAuthService } from '../../connectors/microsoft/microsoft-auth';

export const EXCEL_ROW_ADDED_TYPE = 'excel-row-added';

interface ExcelRowAddedConfig {
  workbookId: string;
  worksheet: string;
  tableName?: string;
}

interface RowPayload {
  index?: number;
  values?: unknown[][];
}

@Injectable()
export class ExcelRowAddedTrigger extends BasePollTrigger {
  readonly type = EXCEL_ROW_ADDED_TYPE;
  readonly name = 'Excel: Row Added';
  readonly description =
    'Fires once per new row appended to an Excel Online table (poll, row-index cursor)';
  readonly requiredConnectionType = 'microsoft';
  readonly defaultIntervalSeconds = 300;

  constructor(private readonly auth: MicrosoftAuthService) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as unknown as ExcelRowAddedConfig;
    if (typeof cfg.workbookId !== 'string' || cfg.workbookId.length === 0) {
      throw new Error('excel-row-added requires config.workbookId');
    }
    if (typeof cfg.worksheet !== 'string' || cfg.worksheet.length === 0) {
      throw new Error('excel-row-added requires config.worksheet');
    }
    const tableName = cfg.tableName && cfg.tableName.length > 0 ? cfg.tableName : 'Table1';
    const previousCount = parseCursor(ctx.cursor);
    const conn = ctx.connection as DecryptedConnection<MicrosoftOAuth2Config>;

    const tablePath =
      `/v1.0/me/drive/items/${encodeURIComponent(cfg.workbookId)}` +
      `/workbook/worksheets('${encodeURIComponent(cfg.worksheet)}')` +
      `/tables('${encodeURIComponent(tableName)}')`;
    const rowsPath = `${tablePath}/rows`;

    const path = ctx.cursor === null ? rowsPath : `${rowsPath}?$skip=${previousCount}&$top=200`;

    const response = await this.auth.graphFetch<{ value?: RowPayload[] }>(conn, path);

    const fetched = response.data?.value ?? [];

    if (ctx.cursor === null) {
      // First tick: just record current row count, do NOT replay history.
      return { items: [], newCursor: String(fetched.length) };
    }

    if (fetched.length === 0) {
      // An empty page at $skip=previousCount is ambiguous: either no rows were
      // added, or the table shrank below the cursor (deleted rows). The latter
      // would leave the cursor stuck high, silently dropping every row added until
      // the table re-exceeds the old size. Disambiguate via the table's real
      // data-row count and re-baseline on a regression.
      const totalRows = await this.fetchDataRowCount(conn, tablePath);
      if (totalRows < previousCount) {
        return { items: [], newCursor: String(totalRows) };
      }
      return { items: [], newCursor: String(previousCount) };
    }

    const items: Record<string, unknown>[] = fetched.map((row, idx) => ({
      rowIndex: row.index ?? previousCount + idx,
      values: row.values ?? [],
      workbookId: cfg.workbookId,
      worksheet: cfg.worksheet,
      tableName,
    }));

    return { items, newCursor: String(previousCount + fetched.length) };
  }

  // The table's current data-row count (excludes the header). `dataBodyRange` 404s
  // when the table has no data rows, which we map to 0 — the regression check then
  // correctly re-baselines an empty table's cursor back to 0.
  private async fetchDataRowCount(
    conn: DecryptedConnection<MicrosoftOAuth2Config>,
    tablePath: string,
  ): Promise<number> {
    try {
      const res = await this.auth.graphFetch<{ rowCount?: number }>(
        conn,
        `${tablePath}/dataBodyRange?%24select=rowCount`,
      );
      return res.data?.rowCount ?? 0;
    } catch (err) {
      if (err instanceof GraphHttpError && err.response.status === 404) return 0;
      throw err;
    }
  }
}

function parseCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
