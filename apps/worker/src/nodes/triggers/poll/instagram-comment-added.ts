import { Injectable } from '@nestjs/common';
import {
  BasePollTrigger,
  type DecryptedConnection,
  type PollContext,
  type PollResult,
} from '@tietide/sdk';
import type { InstagramOAuth2Config } from '@tietide/shared';
import { MetaGraphClientFactory } from '../../connectors/meta/meta-graph-client.factory';

export const INSTAGRAM_COMMENT_ADDED_TYPE = 'instagram-comment-added';

interface InstagramCommentsResponse {
  data?: Array<{ id?: string; text?: string; username?: string; timestamp?: string }>;
}

@Injectable()
export class InstagramCommentAddedTrigger extends BasePollTrigger {
  readonly type = INSTAGRAM_COMMENT_ADDED_TYPE;
  readonly name = 'Instagram: Comment Added';
  readonly description =
    'Fires when a new comment is added to an Instagram media (poll, timestamp)';
  readonly requiredConnectionType = 'instagram';
  readonly defaultIntervalSeconds = 300;

  constructor(private readonly client: MetaGraphClientFactory) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as { mediaId?: string };
    if (typeof cfg.mediaId !== 'string' || cfg.mediaId.length === 0) {
      throw new Error('instagram-comment-added requires config.mediaId');
    }

    // First tick: record "now" as the watermark and replay nothing.
    if (ctx.cursor === null) {
      return { items: [], newCursor: new Date().toISOString() };
    }

    const connection = ctx.connection as DecryptedConnection<InstagramOAuth2Config>;
    const res = await this.client.call<InstagramCommentsResponse>(
      connection,
      `/${cfg.mediaId}/comments`,
      { searchParams: { fields: 'id,text,username,timestamp', limit: '50' } },
    );

    // ISO 8601 timestamps sort lexicographically, so a string compare against the
    // cursor isolates comments created since the last tick.
    const fresh = (res.data.data ?? []).filter(
      (c) => typeof c.timestamp === 'string' && c.timestamp > ctx.cursor!,
    );
    const newCursor = fresh.reduce(
      (max, c) => (c.timestamp && c.timestamp > max ? c.timestamp : max),
      ctx.cursor,
    );

    const items = fresh.map((c) => ({
      id: c.id ?? null,
      text: c.text ?? null,
      username: c.username ?? null,
      timestamp: c.timestamp ?? null,
      mediaId: cfg.mediaId,
    }));

    return { items, newCursor };
  }
}
