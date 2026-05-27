import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { excelUpdateRowConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';
import {
  buildTablePath,
  fetchAllTableRows,
  fetchHeaderRow,
  matchCell,
  resolveColumnIndex,
  rowCells,
} from './excel-table-utils';

export const EXCEL_UPDATE_ROW_TYPE = 'excel-update-row';

@Injectable()
export class ExcelUpdateRowAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = EXCEL_UPDATE_ROW_TYPE;
  readonly name = 'Excel: Update Row';
  readonly description = 'Overwrite an Excel table row by index or by a unique column lookup';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = excelUpdateRowConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveUpdated: { rowIndex: params.rowIndex ?? null, lookup: params.lookup ?? null },
        },
        metadata: { mocked: true },
      };
    }

    const tablePath = buildTablePath(params.workbookId, params.worksheet, params.tableName);
    const resolvedIndex = await this.resolveRowIndex(params, connection, tablePath);

    const res = await this.authService.graphFetch<{ index?: number }>(
      connection,
      `${tablePath}/rows/itemAt(index=${resolvedIndex})`,
      { method: 'PATCH', body: JSON.stringify({ values: [params.values] }) },
    );

    return {
      data: { rowIndex: resolvedIndex, updated: true },
      metadata: { statusCode: res.status },
    };
  }

  private async resolveRowIndex(
    params: ReturnType<typeof excelUpdateRowConfigSchema.parse>,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    tablePath: string,
  ): Promise<number> {
    if (params.rowIndex !== undefined) return params.rowIndex;
    if (!params.lookup) {
      // Unreachable — the schema's refine guarantees one of rowIndex/lookup.
      throw new Error('excel-update-row requires rowIndex or lookup');
    }

    const header = await fetchHeaderRow(this.authService, connection, tablePath);
    const columnIndex = resolveColumnIndex(header, params.lookup.column);
    if (columnIndex === -1) {
      throw new Error(`Column "${params.lookup.column}" not found in table "${params.tableName}"`);
    }

    const rows = await fetchAllTableRows(this.authService, connection, tablePath);
    const lookupValue = params.lookup.value;
    const matches = rows.filter((r) => matchCell(rowCells(r)[columnIndex], lookupValue, 'exact'));

    if (matches.length === 0) {
      throw new Error(`No row matched ${params.lookup.column}="${lookupValue}"`);
    }
    if (matches.length > 1) {
      throw new Error(
        `Lookup ${params.lookup.column}="${lookupValue}" matched ${matches.length} rows; refusing to update ambiguously`,
      );
    }

    const index = matches[0].index;
    if (index === undefined) throw new Error('Matched row is missing a row index');
    return index;
  }
}
