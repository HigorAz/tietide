import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { instagramPublishPhotoConfigSchema, type InstagramOAuth2Config } from '@tietide/shared';
import { MetaGraphClientFactory } from '../meta/meta-graph-client.factory';

export const INSTAGRAM_PUBLISH_PHOTO_TYPE = 'instagram-publish-photo';

@Injectable()
export class InstagramPublishPhotoAction extends BaseConnectorAction<InstagramOAuth2Config> {
  readonly type = INSTAGRAM_PUBLISH_PHOTO_TYPE;
  readonly name = 'Instagram: Publish Photo';
  readonly description = 'Publish a single image post to an Instagram Business account';
  readonly requiredConnectionType = 'instagram';

  constructor(private readonly client: MetaGraphClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<InstagramOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = instagramPublishPhotoConfigSchema.parse(input.params);

    // Step 1: create a media container referencing the public image URL.
    const container = await this.client.call<{ id?: string }>(
      connection,
      `/${params.igUserId}/media`,
      {
        method: 'POST',
        searchParams: { image_url: params.imageUrl, caption: params.caption },
      },
    );
    const creationId = container.data.id;
    if (typeof creationId !== 'string' || creationId.length === 0) {
      throw new Error('Instagram media container creation returned no id');
    }

    // Step 2: publish the container.
    const published = await this.client.call<{ id?: string }>(
      connection,
      `/${params.igUserId}/media_publish`,
      {
        method: 'POST',
        searchParams: { creation_id: creationId },
      },
    );

    return {
      data: {
        mediaId: published.data.id ?? null,
        creationId,
        igUserId: params.igUserId,
      },
      metadata: { statusCode: published.status },
    };
  }
}
