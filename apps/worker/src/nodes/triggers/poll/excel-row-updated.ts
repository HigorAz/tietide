import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  BasePollTrigger,
  type DecryptedConnection,
  type PollContext,
  type PollResult,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from '../../connectors/microsoft/microsoft-auth';
import {
  buildTablePath,
  fetchAllTableRows,
  rowCells,
} from '../../connectors/microsoft/excel-table-utils';

export const EXCEL_ROW_UPDATED_TYPE = 'excel-row-updated';

interface ExcelRowUpdatedConfig {
  workbookId: string;
  worksheet: string;
  tableName?: string;
}

// Cursor is a JSON object mapping each row index → a hash of that row's values.
// Comparing successive hashes is the only reliable change-detection available
// (Excel exposes no per-row change webhook or modified timestamp via Graph).
type HashMap = Record<string, string>;

const hashRow = (values: unknown[]): string =>
  createHash('sha256').update(JSON.stringify(values)).digest('hex');

const parseCursor = (cursor: string | null): HashMap => {
  if (cursor === null) return {};
  try {
    const parsed: unknown = JSON.parse(cursor);
    return parsed && typeof parsed === 'object' ? (parsed as HashMap) : {};
  } catch {
    return {};
  }
};

@Injectable()
export class ExcelRowUpdatedTrigger extends BasePollTrigger {
  readonly type = EXCEL_ROW_UPDATED_TYPE;
  readonly name = 'Excel: Row Updated';
  readonly description =
    'Fires when an existing Excel Online table row changes (poll, per-row value hash)';
  readonly requiredConnectionType = 'microsoft';
  readonly defaultIntervalSeconds = 300;

  constructor(private readonly auth: MicrosoftAuthService) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as unknown as ExcelRowUpdatedConfig;
    if (typeof cfg.workbookId !== 'string' || cfg.workbookId.length === 0) {
      throw new Error('excel-row-updated requires config.workbookId');
    }
    if (typeof cfg.worksheet !== 'string' || cfg.worksheet.length === 0) {
      throw new Error('excel-row-updated requires config.worksheet');
    }
    const tableName = cfg.tableName && cfg.tableName.length > 0 ? cfg.tableName : 'Table1';

    const tablePath = buildTablePath(cfg.workbookId, cfg.worksheet, tableName);
    const rows = await fetchAllTableRows(
      this.auth,
      ctx.connection as DecryptedConnection<MicrosoftOAuth2Config>,
      tablePath,
    );

    const newCursor: HashMap = {};
    for (const row of rows) {
      if (row.index === undefined) continue;
      newCursor[String(row.index)] = hashRow(rowCells(row));
    }

    // First tick: snapshot the current hashes, replay nothing.
    if (ctx.cursor === null) {
      return { items: [], newCursor: JSON.stringify(newCursor) };
    }

    const previous = parseCursor(ctx.cursor);
    const items: Record<string, unknown>[] = [];
    for (const row of rows) {
      if (row.index === undefined) continue;
      const key = String(row.index);
      // Emit only rows present in BOTH snapshots whose hash changed — brand-new
      // rows are excel-row-added's job; deletions are ignored.
      if (key in previous && previous[key] !== newCursor[key]) {
        items.push({
          rowIndex: row.index,
          values: row.values ?? [],
          workbookId: cfg.workbookId,
          worksheet: cfg.worksheet,
          tableName,
        });
      }
    }

    return { items, newCursor: JSON.stringify(newCursor) };
  }
}
