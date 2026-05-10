import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { DecryptedConnection } from '@tietide/sdk';
import type { S3CustomConfig } from '@tietide/shared';

export interface S3PutResult {
  bucket: string;
  key: string;
  etag: string | null;
  location: string | null;
  versionId: string | null;
  // Indicates which code-path handled the upload — assertable in tests so we
  // can be sure large files actually go through the streaming Upload helper
  // rather than buffering through PutObjectCommand.
  via: 'put-object' | 'multipart-upload';
}

@Injectable()
export class S3ClientFactory {
  buildClient(connection: DecryptedConnection<S3CustomConfig>): S3Client {
    const cfg = connection.config;
    return new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle ?? false,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async putObject(args: {
    connection: DecryptedConnection<S3CustomConfig>;
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
  }): Promise<S3PutResult> {
    const client = this.buildClient(args.connection);
    const result = await client.send(
      new PutObjectCommand({
        Bucket: args.bucket,
        Key: args.key,
        Body: args.body,
        ContentType: args.contentType,
        CacheControl: args.cacheControl,
        Metadata: args.metadata,
      }),
    );
    client.destroy();

    return {
      bucket: args.bucket,
      key: args.key,
      etag: result.ETag ?? null,
      location: null,
      versionId: result.VersionId ?? null,
      via: 'put-object',
    };
  }

  // Streams via @aws-sdk/lib-storage Upload — uploads in 5 MiB parts, never
  // buffers more than `partSize` bytes in memory at once. Used for any payload
  // above the streaming threshold so workers don't OOM on large uploads.
  async uploadStream(args: {
    connection: DecryptedConnection<S3CustomConfig>;
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
  }): Promise<S3PutResult> {
    const client = this.buildClient(args.connection);
    const upload = new Upload({
      client,
      params: {
        Bucket: args.bucket,
        Key: args.key,
        Body: args.body,
        ContentType: args.contentType,
        CacheControl: args.cacheControl,
        Metadata: args.metadata,
      },
      // 5 MiB parts — AWS minimum.
      partSize: 5 * 1024 * 1024,
      queueSize: 4,
      leavePartsOnError: false,
    });

    const result = await upload.done();
    client.destroy();

    type UploadCompletedOutput = { ETag?: string; Location?: string; VersionId?: string };
    const r = result as UploadCompletedOutput;

    return {
      bucket: args.bucket,
      key: args.key,
      etag: r.ETag ?? null,
      location: r.Location ?? null,
      versionId: r.VersionId ?? null,
      via: 'multipart-upload',
    };
  }
}
