import { Inject, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { driveCreateConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const DRIVE_CREATE_TYPE = 'drive-create';

@Injectable()
export class DriveCreateAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = DRIVE_CREATE_TYPE;
  readonly name = 'Drive: Create File';
  readonly description = 'Create a file in Google Drive';
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
    const params = driveCreateConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: {
            name: params.name,
            mimeType: params.mimeType,
            parentFolderId: params.parentFolderId ?? null,
            byteLength: params.content.length,
          },
        },
        metadata: { mocked: true },
      };
    }

    const drive = this.clients.drive({ auth: this.authService.buildClient(connection) });
    const response = await drive.files.create({
      requestBody: {
        name: params.name,
        mimeType: params.mimeType,
        ...(params.parentFolderId ? { parents: [params.parentFolderId] } : {}),
      },
      media: {
        mimeType: params.mimeType,
        body: Readable.from([params.content]),
      },
      fields: 'id, name, mimeType, webViewLink',
    });

    return {
      data: {
        fileId: response.data.id ?? null,
        name: response.data.name ?? params.name,
        mimeType: response.data.mimeType ?? params.mimeType,
        webViewLink: response.data.webViewLink ?? null,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
