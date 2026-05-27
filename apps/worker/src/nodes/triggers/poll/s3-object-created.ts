import { Injectable } from '@nestjs/common';
import {
  BasePollTrigger,
  type DecryptedConnection,
  type PollContext,
  type PollResult,
} from '@tietide/sdk';
import type { S3CustomConfig } from '@tietide/shared';
import { S3ClientFactory } from '../../connectors/s3/s3-client.factory';

export const S3_OBJECT_CREATED_TYPE = 's3-object-created';

interface S3ObjectCreatedConfig {
  bucket: string;
  prefix?: string;
}

@Injectable()
export class S3ObjectCreatedTrigger extends BasePollTrigger {
  readonly type = S3_OBJECT_CREATED_TYPE;
  readonly name = 'S3: Object Created';
  readonly description =
    'Fires once per new object under a bucket/prefix (poll, last-modified watermark cursor)';
  readonly requiredConnectionType = 's3';
  readonly defaultIntervalSeconds = 300;

  constructor(private readonly client: S3ClientFactory) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as unknown as S3ObjectCreatedConfig;
    if (typeof cfg.bucket !== 'string' || cfg.bucket.length === 0) {
      throw new Error('s3-object-created requires config.bucket');
    }

    const result = await this.client.listObjects({
      connection: ctx.connection as DecryptedConnection<S3CustomConfig>,
      bucket: cfg.bucket,
      prefix: cfg.prefix,
      maxKeys: 1000,
    });

    // ISO-8601 UTC timestamps sort lexicographically in chronological order.
    const maxLastModified = result.objects.reduce<string | null>((acc, o) => {
      if (!o.lastModified) return acc;
      return acc === null || o.lastModified > acc ? o.lastModified : acc;
    }, null);

    if (ctx.cursor === null) {
      // First tick: establish the watermark without replaying existing objects.
      return { items: [], newCursor: maxLastModified ?? new Date(0).toISOString() };
    }

    const cursorTime = ctx.cursor;
    const items: Record<string, unknown>[] = result.objects
      .filter((o) => o.lastModified !== null && o.lastModified > cursorTime)
      .map((o) => ({
        key: o.key,
        size: o.size,
        lastModified: o.lastModified,
        etag: o.etag,
        bucket: cfg.bucket,
      }));

    const newCursor =
      maxLastModified !== null && maxLastModified > cursorTime ? maxLastModified : cursorTime;

    return { items, newCursor };
  }
}
