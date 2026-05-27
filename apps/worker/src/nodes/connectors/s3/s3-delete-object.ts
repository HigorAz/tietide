import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { s3DeleteObjectConfigSchema, type S3CustomConfig } from '@tietide/shared';
import { S3ClientFactory } from './s3-client.factory';

export const S3_DELETE_OBJECT_TYPE = 's3-delete-object';

@Injectable()
export class S3DeleteObjectAction extends BaseConnectorAction<S3CustomConfig> {
  readonly type = S3_DELETE_OBJECT_TYPE;
  readonly name = 'S3: Delete Object';
  readonly description = 'Delete an object from an S3 bucket';
  readonly requiredConnectionType = 's3';

  constructor(private readonly client: S3ClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<S3CustomConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = s3DeleteObjectConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveDeleted: { bucket: params.bucket, key: params.key } },
        metadata: { mocked: true },
      };
    }

    const result = await this.client.deleteObject({
      connection,
      bucket: params.bucket,
      key: params.key,
    });

    return {
      data: {
        bucket: result.bucket,
        key: result.key,
        deleted: result.deleted,
        versionId: result.versionId,
      },
      metadata: { statusCode: 204 },
    };
  }
}
