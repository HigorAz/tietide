import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { sheetsClearRangeConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const SHEETS_CLEAR_RANGE_TYPE = 'sheets-clear-range';

@Injectable()
export class SheetsClearRangeAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = SHEETS_CLEAR_RANGE_TYPE;
  readonly name = 'Sheets: Clear Range';
  readonly description = 'Clear all values in a range of a Google Sheet (A1 notation)';
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
    const params = sheetsClearRangeConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCleared: { spreadsheetId: params.spreadsheetId, range: params.range },
        },
        metadata: { mocked: true },
      };
    }

    const sheets = this.clients.sheets({ auth: this.authService.buildClient(connection) });
    const response = await sheets.spreadsheets.values.clear({
      spreadsheetId: params.spreadsheetId,
      range: params.range,
      requestBody: {},
    });

    return {
      data: {
        spreadsheetId: response.data.spreadsheetId ?? params.spreadsheetId,
        clearedRange: response.data.clearedRange ?? params.range,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
