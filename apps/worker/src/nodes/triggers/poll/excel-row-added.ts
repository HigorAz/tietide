import { Injectable } from '@nestjs/common';
import {
  BasePollTrigger,
  type DecryptedConnection,
  type PollContext,
  type PollResult,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from '../../connectors/microsoft/microsoft-auth';

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

    const basePath =
      `/v1.0/me/drive/items/${encodeURIComponent(cfg.workbookId)}` +
      `/workbook/worksheets('${encodeURIComponent(cfg.worksheet)}')` +
      `/tables('${encodeURIComponent(tableName)}')` +
      `/rows`;

    const path = ctx.cursor === null ? basePath : `${basePath}?$skip=${previousCount}&$top=200`;

    const response = await this.auth.graphFetch<{ value?: RowPayload[] }>(
      ctx.connection as DecryptedConnection<MicrosoftOAuth2Config>,
      path,
    );

    const fetched = response.data?.value ?? [];

    if (ctx.cursor === null) {
      // First tick: just record current row count, do NOT replay history.
      return { items: [], newCursor: String(fetched.length) };
    }

    if (fetched.length === 0) {
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
}

function parseCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
