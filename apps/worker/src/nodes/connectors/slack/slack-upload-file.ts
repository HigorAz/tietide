import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackUploadFileConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_UPLOAD_FILE_TYPE = 'slack-upload-file';

interface SlackFilesUploadResponse {
  ok: boolean;
  file?: { id?: string; name?: string; permalink?: string };
}

@Injectable()
export class SlackUploadFileAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_UPLOAD_FILE_TYPE;
  readonly name = 'Slack: Upload File';
  readonly description = 'Upload a base64 file payload to a Slack channel';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackUploadFileConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveUploaded: {
            channel: params.channel,
            filename: params.filename,
            size: Math.floor(params.contentBase64.length * 0.75),
          },
        },
        metadata: { mocked: true },
      };
    }

    // files.upload (v1) accepts multipart/form-data with a file field. We decode
    // the base64 payload to bytes and post via FormData.
    const fileBytes = Buffer.from(params.contentBase64, 'base64');
    const form = new FormData();
    form.append('channels', params.channel);
    form.append('filename', params.filename);
    if (params.title) form.append('title', params.title);
    if (params.initialComment) form.append('initial_comment', params.initialComment);
    form.append('file', new Blob([fileBytes]), params.filename);

    const response = await this.client.call<SlackFilesUploadResponse>(
      connection,
      '/files.upload',
      // FormData sets its own multipart Content-Type with boundary; we pass it
      // through and explicitly clear the default JSON content-type.
      {
        method: 'POST',
        body: form as unknown as BodyInit,
        // Empty contentType so the factory does not overwrite the multipart boundary header.
        contentType: '',
        headers: {},
      },
    );

    return {
      data: {
        ok: response.data.ok === true,
        fileId: response.data.file?.id ?? null,
        permalink: response.data.file?.permalink ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
