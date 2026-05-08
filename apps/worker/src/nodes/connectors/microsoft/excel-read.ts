import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { excelReadConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const EXCEL_READ_TYPE = 'excel-read';

interface ExcelRangeResponse {
  address?: string;
  rowCount?: number;
  columnCount?: number;
  values?: unknown[][];
}

@Injectable()
export class ExcelReadAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = EXCEL_READ_TYPE;
  readonly name = 'Excel: Read Range';
  readonly description = 'Read a range from an Excel Online worksheet (A1 notation)';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = excelReadConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveRead: {
            workbookId: params.workbookId,
            worksheet: params.worksheet,
            range: params.range,
          },
          values: [],
        },
        metadata: { mocked: true },
      };
    }

    const path = `/v1.0/me/drive/items/${encodeURIComponent(params.workbookId)}/workbook/worksheets('${encodeURIComponent(params.worksheet)}')/range(address='${params.range}')?%24select=address%2CrowCount%2CcolumnCount%2Cvalues`;

    const response = await this.authService.graphFetch<ExcelRangeResponse>(connection, path);
    const data = response.data ?? {};

    return {
      data: {
        values: data.values ?? [],
        rowCount: data.rowCount ?? 0,
        columnCount: data.columnCount ?? 0,
        address: data.address ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
