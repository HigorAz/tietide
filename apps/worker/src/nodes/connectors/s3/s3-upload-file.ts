import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import {
  s3UploadFileConfigSchema,
  S3_STREAMING_THRESHOLD_BYTES,
  type S3CustomConfig,
} from '@tietide/shared';
import { S3ClientFactory } from './s3-client.factory';

export const S3_UPLOAD_FILE_TYPE = 's3-upload-file';

@Injectable()
export class S3UploadFileAction extends BaseConnectorAction<S3CustomConfig> {
  readonly type = S3_UPLOAD_FILE_TYPE;
  readonly name = 'S3: Upload File';
  readonly description =
    'Upload an object to S3 / R2 / MinIO (streams large content via multipart)';
  readonly requiredConnectionType = 's3';

  constructor(private readonly client: S3ClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<S3CustomConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = s3UploadFileConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveUploaded: { bucket: params.bucket, key: params.key },
        },
        metadata: { mocked: true },
      };
    }

    const body = Buffer.from(
      params.content,
      params.contentEncoding === 'base64' ? 'base64' : 'utf8',
    );

    const args = {
      connection,
      bucket: params.bucket,
      key: params.key,
      body,
      contentType: params.contentType,
      cacheControl: params.cacheControl,
      metadata: params.metadata,
    };

    // Threshold: anything ≥ 5 MiB uses the streaming Upload helper so we never
    // hold > partSize bytes in memory beyond the input Buffer. Below that,
    // PutObjectCommand is one round-trip and avoids multipart overhead.
    const result =
      body.length >= S3_STREAMING_THRESHOLD_BYTES
        ? await this.client.uploadStream(args)
        : await this.client.putObject(args);

    return {
      data: {
        bucket: result.bucket,
        key: result.key,
        etag: result.etag,
        location: result.location,
        versionId: result.versionId,
        via: result.via,
        size: body.length,
      },
      metadata: { statusCode: 200 },
    };
  }
}
