import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { driveListConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const DRIVE_LIST_TYPE = 'drive-list';

const escapeForDriveQuery = (s: string): string => s.replace(/'/g, "\\'");

@Injectable()
export class DriveListAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = DRIVE_LIST_TYPE;
  readonly name = 'Drive: List Files';
  readonly description = 'List files in a Google Drive folder';
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
    const params = driveListConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveListed: {
            folderId: params.folderId,
            query: params.query ?? null,
            maxResults: params.maxResults ?? null,
          },
          files: [],
        },
        metadata: { mocked: true },
      };
    }

    const folderClause = `'${escapeForDriveQuery(params.folderId)}' in parents`;
    const q = params.query ? `${folderClause} and (${params.query})` : folderClause;

    const drive = this.clients.drive({ auth: this.authService.buildClient(connection) });
    const response = await drive.files.list({
      q,
      pageSize: params.maxResults,
      fields: 'files(id, name, mimeType, modifiedTime, size), nextPageToken',
    });

    return {
      data: {
        files: response.data.files ?? [],
        nextPageToken: response.data.nextPageToken ?? null,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
