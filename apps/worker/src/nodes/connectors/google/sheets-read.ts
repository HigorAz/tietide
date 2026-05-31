import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { sheetsReadConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const SHEETS_READ_TYPE = 'sheets-read';

@Injectable()
export class SheetsReadAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = SHEETS_READ_TYPE;
  readonly name = 'Sheets: Read Range';
  readonly description = 'Read a range from a Google Sheet (A1 notation)';
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
    const params = sheetsReadConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveRead: {
            spreadsheetId: params.spreadsheetId,
            range: params.range,
          },
          values: [],
        },
        metadata: { mocked: true },
      };
    }

    const sheets = this.clients.sheets({ auth: this.authService.buildClient(connection) });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: params.spreadsheetId,
      range: params.range,
    });

    return {
      data: {
        range: response.data.range ?? params.range,
        values: response.data.values ?? [],
        majorDimension: response.data.majorDimension ?? 'ROWS',
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
