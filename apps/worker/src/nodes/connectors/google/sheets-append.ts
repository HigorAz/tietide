import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { sheetsAppendConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const SHEETS_APPEND_TYPE = 'sheets-append';

@Injectable()
export class SheetsAppendAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = SHEETS_APPEND_TYPE;
  readonly name = 'Sheets: Append Row';
  readonly description = 'Append rows of values to a Google Sheet';
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
    const params = sheetsAppendConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveAppended: {
            spreadsheetId: params.spreadsheetId,
            sheet: params.sheet,
            rowCount: params.values.length,
          },
        },
        metadata: { mocked: true },
      };
    }

    const sheets = this.clients.sheets({ auth: this.authService.buildClient(connection) });
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: params.spreadsheetId,
      range: params.sheet,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: params.values as unknown[][] },
    });

    return {
      data: {
        spreadsheetId: response.data.spreadsheetId ?? params.spreadsheetId,
        updatedRange: response.data.updates?.updatedRange ?? null,
        updatedRows: response.data.updates?.updatedRows ?? 0,
        updatedColumns: response.data.updates?.updatedColumns ?? 0,
        updatedCells: response.data.updates?.updatedCells ?? 0,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
