import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { onedriveCreateConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const ONEDRIVE_CREATE_TYPE = 'onedrive-create';

interface DriveItemResponse {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
}

@Injectable()
export class OnedriveCreateAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = ONEDRIVE_CREATE_TYPE;
  readonly name = 'OneDrive: Create File';
  readonly description = 'Create a file in OneDrive';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = onedriveCreateConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: {
            name: params.name,
            mimeType: params.mimeType,
            parentFolderId: params.parentFolderId ?? null,
            byteLength: params.contentBase64.length,
          },
        },
        metadata: { mocked: true },
      };
    }

    const buffer = Buffer.from(params.contentBase64, 'base64');
    const encodedName = encodeURIComponent(params.name);
    const path = params.parentFolderId
      ? `/v1.0/me/drive/items/${encodeURIComponent(params.parentFolderId)}:/${encodedName}:/content`
      : `/v1.0/me/drive/root:/${encodedName}:/content`;

    const response = await this.authService.graphFetch<DriveItemResponse>(connection, path, {
      method: 'PUT',
      body: buffer,
      contentType: params.mimeType,
    });
    const data = response.data ?? {};

    return {
      data: {
        fileId: data.id ?? null,
        name: data.name ?? params.name,
        webUrl: data.webUrl ?? null,
        size: data.size ?? buffer.length,
      },
      metadata: { statusCode: response.status },
    };
  }
}
