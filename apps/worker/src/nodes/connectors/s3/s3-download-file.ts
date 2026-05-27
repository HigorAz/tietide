import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { s3DownloadFileConfigSchema, type S3CustomConfig } from '@tietide/shared';
import { S3ClientFactory } from './s3-client.factory';

export const S3_DOWNLOAD_FILE_TYPE = 's3-download-file';

@Injectable()
export class S3DownloadFileAction extends BaseConnectorAction<S3CustomConfig> {
  readonly type = S3_DOWNLOAD_FILE_TYPE;
  readonly name = 'S3: Download File';
  readonly description = 'Download an object from S3 / R2 / MinIO (returns base64 content)';
  readonly requiredConnectionType = 's3';

  constructor(private readonly client: S3ClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<S3CustomConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = s3DownloadFileConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, bucket: params.bucket, key: params.key, body: '' },
        metadata: { mocked: true },
      };
    }

    const result = await this.client.getObject({
      connection,
      bucket: params.bucket,
      key: params.key,
    });

    return {
      data: {
        bucket: result.bucket,
        key: result.key,
        body: result.body,
        contentType: result.contentType,
        contentLength: result.contentLength,
        etag: result.etag,
        metadata: result.metadata,
      },
      metadata: { statusCode: 200 },
    };
  }
}
