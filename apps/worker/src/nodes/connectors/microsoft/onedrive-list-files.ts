import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { onedriveListFilesConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const ONEDRIVE_LIST_FILES_TYPE = 'onedrive-list-files';

interface DriveItem {
  id?: string | null;
  name?: string | null;
  size?: number | null;
  webUrl?: string | null;
  lastModifiedDateTime?: string | null;
  file?: { mimeType?: string | null } | null;
  folder?: unknown;
}

@Injectable()
export class OnedriveListFilesAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = ONEDRIVE_LIST_FILES_TYPE;
  readonly name = 'OneDrive: List Files';
  readonly description = 'List items in a OneDrive folder (by id, path, or the drive root)';
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
    const params = onedriveListFilesConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveListed: {
            folderId: params.folderId ?? null,
            folderPath: params.folderPath ?? null,
          },
          files: [],
          count: 0,
        },
        metadata: { mocked: true },
      };
    }

    let path = this.buildChildrenPath(params.folderId, params.folderPath);
    if (params.top !== undefined) path += `?$top=${params.top}`;

    const res = await this.authService.graphFetch<{ value?: DriveItem[] }>(connection, path);
    const items = res.data?.value ?? [];

    const files = items.map((it) => ({
      id: it.id ?? null,
      name: it.name ?? null,
      size: it.size ?? 0,
      isFolder: it.folder !== undefined && it.folder !== null,
      mimeType: it.file?.mimeType ?? null,
      lastModifiedDateTime: it.lastModifiedDateTime ?? null,
      webUrl: it.webUrl ?? null,
    }));

    return { data: { files, count: files.length }, metadata: { statusCode: res.status } };
  }

  private buildChildrenPath(folderId?: string, folderPath?: string): string {
    if (folderId) {
      return `/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children`;
    }
    if (folderPath) {
      const clean = folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
      // encodeURI keeps "/" so multi-segment paths address nested folders.
      return `/v1.0/me/drive/root:/${encodeURI(clean)}:/children`;
    }
    return '/v1.0/me/drive/root/children';
  }
}
