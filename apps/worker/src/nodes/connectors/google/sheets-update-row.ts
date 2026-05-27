import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { sheetsUpdateRowConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const SHEETS_UPDATE_ROW_TYPE = 'sheets-update-row';

// A1 sheet names with anything other than word characters must be single-quoted
// (and embedded quotes doubled), e.g. "My Tab" -> 'My Tab'.
const a1Sheet = (name: string): string =>
  /^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;

@Injectable()
export class SheetsUpdateRowAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = SHEETS_UPDATE_ROW_TYPE;
  readonly name = 'Sheets: Update Row';
  readonly description = 'Overwrite a row in a Google Sheet by its row number';
  readonly requiredConnectionType = 'google';

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
    const params = sheetsUpdateRowConfigSchema.parse(input.params);
    const range = `${a1Sheet(params.sheet)}!A${params.rowNumber}`;

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveUpdated: { spreadsheetId: params.spreadsheetId, range },
        },
        metadata: { mocked: true },
      };
    }

    const sheets = this.clients.sheets({ auth: this.authService.buildClient(connection) });
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: params.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [params.values as unknown[]] },
    });

    return {
      data: {
        updatedRange: response.data.updatedRange ?? range,
        updatedCells: response.data.updatedCells ?? 0,
        updatedRows: response.data.updatedRows ?? 0,
        updatedColumns: response.data.updatedColumns ?? 0,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
