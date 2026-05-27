import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { s3ListObjectsConfigSchema, type S3CustomConfig } from '@tietide/shared';
import { S3ClientFactory } from './s3-client.factory';

export const S3_LIST_OBJECTS_TYPE = 's3-list-objects';

@Injectable()
export class S3ListObjectsAction extends BaseConnectorAction<S3CustomConfig> {
  readonly type = S3_LIST_OBJECTS_TYPE;
  readonly name = 'S3: List Objects';
  readonly description =
    'List objects in an S3 bucket by prefix (paginated via continuation token)';
  readonly requiredConnectionType = 's3';

  constructor(private readonly client: S3ClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<S3CustomConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = s3ListObjectsConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, objects: [], isTruncated: false, nextCursor: null },
        metadata: { mocked: true },
      };
    }

    const result = await this.client.listObjects({
      connection,
      bucket: params.bucket,
      prefix: params.prefix,
      continuationToken: params.continuationToken,
      maxKeys: params.maxKeys,
    });

    return {
      data: {
        objects: result.objects,
        count: result.keyCount,
        isTruncated: result.isTruncated,
        nextCursor: result.nextCursor,
      },
      metadata: { statusCode: 200 },
    };
  }
}
