import { Inject, Injectable } from '@nestjs/common';
import { BasePollTrigger, type PollContext, type PollResult } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import {
  GOOGLE_CLIENTS,
  GoogleAuthService,
  type GoogleClientFactories,
} from '../../connectors/google/google-auth';

export const SHEETS_ROW_ADDED_TYPE = 'sheets-row-added';

interface SheetsRowAddedConfig {
  spreadsheetId: string;
  range: string;
}

@Injectable()
export class SheetsRowAddedTrigger extends BasePollTrigger {
  readonly type = SHEETS_ROW_ADDED_TYPE;
  readonly name = 'Sheets: Row Added';
  readonly description =
    'Fires once per new row appended to a Google Sheet (cursor = last-seen row count)';
  readonly defaultIntervalSeconds = 300;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as unknown as SheetsRowAddedConfig;
    if (typeof cfg.spreadsheetId !== 'string' || cfg.spreadsheetId.length === 0) {
      throw new Error('sheets-row-added requires config.spreadsheetId');
    }
    if (typeof cfg.range !== 'string' || cfg.range.length === 0) {
      throw new Error('sheets-row-added requires config.range');
    }

    const conn = ctx.connection as unknown as {
      id: string;
      type: string;
      provider: string;
      config: GoogleOAuth2Config;
      refreshToken?: string;
    };

    const sheets = this.clients.sheets({
      auth: this.authService.buildClient(conn),
    });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: cfg.spreadsheetId,
      range: cfg.range,
    });

    const rows = (response.data.values ?? []) as unknown[][];
    const totalRows = rows.length;
    const previousCount = this.parseCursor(ctx.cursor);

    if (ctx.cursor === null) {
      return { items: [], newCursor: String(totalRows) };
    }

    if (totalRows < previousCount) {
      // The row count regressed (rows were deleted or the range was edited). A
      // count cursor can't identify which rows are new after a structural change,
      // so re-baseline to the current size rather than holding the old peak —
      // otherwise every row added until the table re-exceeds that peak would be
      // silently dropped (the cursor would stay stuck high forever).
      return { items: [], newCursor: String(totalRows) };
    }

    if (totalRows === previousCount) {
      return { items: [], newCursor: String(previousCount) };
    }

    const newRows = rows.slice(previousCount);
    const items: Record<string, unknown>[] = newRows.map((values, idx) => ({
      rowNumber: previousCount + idx + 1,
      values,
      spreadsheetId: cfg.spreadsheetId,
      range: cfg.range,
    }));

    return { items, newCursor: String(totalRows) };
  }

  private parseCursor(cursor: string | null): number {
    if (cursor === null) return 0;
    const parsed = Number.parseInt(cursor, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
}
