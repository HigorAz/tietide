import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { onedriveGetFileConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const ONEDRIVE_GET_FILE_TYPE = 'onedrive-get-file';

// Skip in-band base64 content for files larger than ~10 MB — keeps the
// execution payload bounded; large blobs should be handled out of band.
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

interface DriveItem {
  id?: string | null;
  name?: string | null;
  size?: number | null;
  webUrl?: string | null;
  lastModifiedDateTime?: string | null;
  file?: { mimeType?: string | null } | null;
  folder?: unknown;
  '@microsoft.graph.downloadUrl'?: string | null;
}

@Injectable()
export class OnedriveGetFileAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = ONEDRIVE_GET_FILE_TYPE;
  readonly name = 'OneDrive: Get File';
  readonly description = 'Fetch OneDrive file metadata and optionally download its content';
  readonly requiredConnectionType = 'microsoft';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = onedriveGetFileConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveFetched: { itemId: params.itemId } },
        metadata: { mocked: true },
      };
    }

    const res = await this.authService.graphFetch<DriveItem>(
      connection,
      `/v1.0/me/drive/items/${encodeURIComponent(params.itemId)}`,
    );
    const item = res.data ?? {};
    const isFolder = item.folder !== undefined && item.folder !== null;
    const size = item.size ?? 0;

    let contentBase64: string | null = null;
    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    if (
      params.downloadContent &&
      !isFolder &&
      typeof downloadUrl === 'string' &&
      downloadUrl.length > 0 &&
      size <= MAX_DOWNLOAD_BYTES
    ) {
      // The pre-authenticated download URL is short-lived and carries its own
      // token, so it is fetched directly rather than through the Graph wrapper.
      const dl = await fetch(downloadUrl);
      if (!dl.ok) {
        throw new Error(`OneDrive content download failed with status ${dl.status}`);
      }
      contentBase64 = Buffer.from(await dl.arrayBuffer()).toString('base64');
    }

    return {
      data: {
        id: item.id ?? params.itemId,
        name: item.name ?? null,
        size,
        mimeType: item.file?.mimeType ?? null,
        lastModifiedDateTime: item.lastModifiedDateTime ?? null,
        webUrl: item.webUrl ?? null,
        isFolder,
        contentBase64,
      },
      metadata: { statusCode: res.status },
    };
  }
}
