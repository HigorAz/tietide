import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { driveGetFileConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const DRIVE_GET_FILE_TYPE = 'drive-get-file';

const DEFAULT_FIELDS = 'id,name,mimeType,size,modifiedTime,parents,webViewLink';
// ~10 MB raw bytes; downstream consumers handle base64 inline. Larger files
// should be processed out of band rather than inflated into a job payload.
const MAX_DOWNLOAD_BYTES = 10_000_000;

@Injectable()
export class DriveGetFileAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = DRIVE_GET_FILE_TYPE;
  readonly name = 'Drive: Get File';
  readonly description = 'Fetch Drive file metadata, with optional content download (base64)';
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
    const params = driveGetFileConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveFetched: { fileId: params.fileId } },
        metadata: { mocked: true },
      };
    }

    const drive = this.clients.drive({ auth: this.authService.buildClient(connection) });
    const metaResponse = await drive.files.get({
      fileId: params.fileId,
      fields: params.fields ?? DEFAULT_FIELDS,
    });
    const meta = (metaResponse.data ?? {}) as Record<string, unknown>;

    const data: Record<string, unknown> = {
      id: meta.id ?? params.fileId,
      name: meta.name ?? null,
      mimeType: meta.mimeType ?? null,
      size: meta.size ?? null,
      modifiedTime: meta.modifiedTime ?? null,
      metadata: meta,
    };

    if (params.downloadContent) {
      const mediaResponse = await drive.files.get(
        { fileId: params.fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      const buffer = Buffer.from(mediaResponse.data as ArrayBuffer);
      if (buffer.length > MAX_DOWNLOAD_BYTES) {
        throw new Error(
          `File content (${buffer.length} bytes) exceeds the ${MAX_DOWNLOAD_BYTES}-byte inline download limit`,
        );
      }
      data.contentBase64 = buffer.toString('base64');
    }

    return { data, metadata: { statusCode: metaResponse.status ?? 200 } };
  }
}
