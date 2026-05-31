import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { excelFindRowConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';
import {
  buildTablePath,
  fetchAllTableRows,
  fetchHeaderRow,
  matchCell,
  resolveColumnIndex,
  rowCells,
} from './excel-table-utils';

export const EXCEL_FIND_ROW_TYPE = 'excel-find-row';

@Injectable()
export class ExcelFindRowAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = EXCEL_FIND_ROW_TYPE;
  readonly name = 'Excel: Find Row';
  readonly description =
    'Find table rows where a column matches a value (exact/contains/startsWith)';
  readonly requiredConnectionType = 'microsoft';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = excelFindRowConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSearched: {
            workbookId: params.workbookId,
            worksheet: params.worksheet,
            tableName: params.tableName,
            column: params.column,
          },
          matchedRows: [],
          matchCount: 0,
        },
        metadata: { mocked: true },
      };
    }

    const tablePath = buildTablePath(params.workbookId, params.worksheet, params.tableName);

    const header = await fetchHeaderRow(this.authService, connection, tablePath);
    const columnIndex = resolveColumnIndex(header, params.column);
    if (columnIndex === -1) {
      throw new Error(`Column "${params.column}" not found in table "${params.tableName}"`);
    }

    const rows = await fetchAllTableRows(this.authService, connection, tablePath);

    const matchedRows: { rowIndex: number | null; values: unknown[] }[] = [];
    for (const row of rows) {
      const cells = rowCells(row);
      if (matchCell(cells[columnIndex], params.value, params.matchMode)) {
        matchedRows.push({ rowIndex: row.index ?? null, values: cells });
        if (params.maxMatches !== undefined && matchedRows.length >= params.maxMatches) break;
      }
    }

    return {
      data: { matchedRows, matchCount: matchedRows.length, columnIndex },
      metadata: { statusCode: 200 },
    };
  }
}
