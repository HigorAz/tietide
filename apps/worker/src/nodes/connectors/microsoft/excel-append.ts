import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { excelAppendConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { GraphHttpError, MicrosoftAuthService } from './microsoft-auth';

export const EXCEL_APPEND_TYPE = 'excel-append';

interface UsedRangeResponse {
  address?: string;
  rowCount?: number;
  columnCount?: number;
  values?: unknown[][];
}

const columnIndexToLetter = (index: number): string => {
  // 1-indexed: 1 → A, 26 → Z, 27 → AA
  let n = index;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
};

const isEmptyUsedRange = (data: UsedRangeResponse | null): boolean => {
  if (!data) return true;
  if (!data.address) return true;
  // Single A1 cell with null/empty value indicates an unused sheet.
  if (data.rowCount === 1 && data.columnCount === 1) {
    const v = data.values?.[0]?.[0];
    if (v === null || v === undefined || v === '') return true;
  }
  return false;
};

const parseLastRow = (address: string): number => {
  // Address is like "Sheet1!A1:C12" or "Sheet1!A1". Take the last segment
  // after ":" (or the whole cell if no range), strip the column letters,
  // parse the trailing digits.
  const cell = address.includes(':')
    ? address.split(':')[1]
    : (address.split('!').pop() ?? address);
  const match = /(\d+)$/.exec(cell);
  if (!match) return 0;
  return parseInt(match[1], 10);
};

@Injectable()
export class ExcelAppendAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = EXCEL_APPEND_TYPE;
  readonly name = 'Excel: Append Row';
  readonly description = 'Append rows of values to an Excel Online worksheet';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = excelAppendConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveAppended: {
            workbookId: params.workbookId,
            worksheet: params.worksheet,
            rowCount: params.values.length,
          },
        },
        metadata: { mocked: true },
      };
    }

    const sheetPath = `/v1.0/me/drive/items/${encodeURIComponent(params.workbookId)}/workbook/worksheets('${encodeURIComponent(params.worksheet)}')`;

    let nextRow = 1;
    try {
      const usedRange = await this.authService.graphFetch<UsedRangeResponse>(
        connection,
        `${sheetPath}/usedRange?%24select=address%2CrowCount%2CcolumnCount%2Cvalues`,
      );
      if (!isEmptyUsedRange(usedRange.data) && usedRange.data?.address) {
        nextRow = parseLastRow(usedRange.data.address) + 1;
      }
    } catch (err) {
      // 404 on usedRange is treated as "empty sheet" — start at row 1.
      // Other errors (auth, server) bubble up to BaseConnectorAction.
      if (err instanceof GraphHttpError && err.response.status === 404) {
        nextRow = 1;
      } else {
        throw err;
      }
    }

    const numRows = params.values.length;
    const numCols = params.values[0]?.length ?? 0;
    const lastCol = columnIndexToLetter(Math.max(numCols, 1));
    const anchor = `A${nextRow}`;
    const address = `${anchor}:${lastCol}${nextRow + numRows - 1}`;

    const patchPath = `${sheetPath}/range(address='${address}')`;
    const response = await this.authService.graphFetch(connection, patchPath, {
      method: 'PATCH',
      body: JSON.stringify({ values: params.values }),
    });

    return {
      data: {
        appendedRowCount: numRows,
        anchor,
        address,
      },
      metadata: { statusCode: response.status },
    };
  }
}
