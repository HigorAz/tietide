import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { sheetsFindRowConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const SHEETS_FIND_ROW_TYPE = 'sheets-find-row';

// The Sheets API has no server-side query, so we read the range and filter in
// memory. Cap the scan to keep memory + latency bounded; report truncation.
const MAX_SCAN_ROWS = 10_000;

interface RowMatch {
  rowNumber: number;
  values: unknown[];
}

@Injectable()
export class SheetsFindRowAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = SHEETS_FIND_ROW_TYPE;
  readonly name = 'Sheets: Find Row';
  readonly description = 'Find rows in a Google Sheet where a column equals a value';
  readonly requiredConnectionType = 'google';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GoogleOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = sheetsFindRowConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSearched: {
            spreadsheetId: params.spreadsheetId,
            range: params.range,
            column: params.column,
          },
          matches: [],
          matchCount: 0,
        },
        metadata: { mocked: true },
      };
    }

    const sheets = this.clients.sheets({ auth: this.authService.buildClient(connection) });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: params.spreadsheetId,
      range: params.range,
    });

    const rows = (response.data.values ?? []) as unknown[][];

    // Resolve the column index. A header name needs the first row as headers;
    // a numeric index addresses the column directly.
    let columnIndex: number;
    let headerOffset: number;
    if (typeof params.column === 'number') {
      columnIndex = params.column;
      headerOffset = params.hasHeaderRow ? 1 : 0;
    } else {
      headerOffset = 1;
      const header = (rows[0] ?? []) as unknown[];
      columnIndex = header.findIndex((cell) => String(cell ?? '') === params.column);
      if (columnIndex === -1) {
        throw new Error(`Column "${params.column}" not found in the header row`);
      }
    }

    const dataRows = rows.slice(headerOffset);
    const truncated = dataRows.length > MAX_SCAN_ROWS;
    const scanRows = truncated ? dataRows.slice(0, MAX_SCAN_ROWS) : dataRows;

    const matches: RowMatch[] = [];
    for (let i = 0; i < scanRows.length; i++) {
      const row = scanRows[i];
      if (String(row[columnIndex] ?? '') === params.value) {
        matches.push({ rowNumber: i + headerOffset + 1, values: row });
        if (params.firstMatchOnly) break;
      }
    }

    return {
      data: { matches, matchCount: matches.length, truncated },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
