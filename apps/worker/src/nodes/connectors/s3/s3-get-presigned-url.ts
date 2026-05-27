import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { s3GetPresignedUrlConfigSchema, type S3CustomConfig } from '@tietide/shared';
import { S3ClientFactory } from './s3-client.factory';

export const S3_GET_PRESIGNED_URL_TYPE = 's3-get-presigned-url';

@Injectable()
export class S3GetPresignedUrlAction extends BaseConnectorAction<S3CustomConfig> {
  readonly type = S3_GET_PRESIGNED_URL_TYPE;
  readonly name = 'S3: Get Presigned URL';
  readonly description = 'Generate a time-limited signed GET or PUT URL for an S3 object';
  readonly requiredConnectionType = 's3';

  constructor(private readonly client: S3ClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<S3CustomConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = s3GetPresignedUrlConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, url: '', operation: params.operation, expiresIn: params.expiresIn },
        metadata: { mocked: true },
      };
    }

    const url = await this.client.getPresignedUrl({
      connection,
      bucket: params.bucket,
      key: params.key,
      operation: params.operation,
      expiresIn: params.expiresIn,
      contentType: params.contentType,
    });

    return {
      data: {
        url,
        bucket: params.bucket,
        key: params.key,
        operation: params.operation,
        expiresIn: params.expiresIn,
      },
      metadata: { statusCode: 200 },
    };
  }
}
