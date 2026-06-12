import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { DecryptedConnection } from '@tietide/sdk';
import type { S3CustomConfig } from '@tietide/shared';
import { assertUrlAllowed, type LookupFn } from '../../actions/ssrf-guard';

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

export interface S3GetResult {
  bucket: string;
  key: string;
  // Object bytes, base64-encoded (mirrors how Drive/Gmail attachments are returned).
  body: string;
  contentType: string | null;
  contentLength: number | null;
  etag: string | null;
  metadata: Record<string, string>;
}

export interface S3ListItem {
  key: string;
  size: number | null;
  lastModified: string | null;
  etag: string | null;
}

export interface S3ListResult {
  objects: S3ListItem[];
  isTruncated: boolean;
  // Opaque continuation token for the next page; null when the listing is complete.
  nextCursor: string | null;
  keyCount: number;
}

export interface S3DeleteResult {
  bucket: string;
  key: string;
  deleted: true;
  versionId: string | null;
}

@Injectable()
export class S3ClientFactory {
  // The S3-compatible `endpoint` (R2/MinIO/etc.) is fully user-controlled, so
  // an author could point it at an internal/metadata address and use the worker
  // as an SSRF proxy. We resolve+validate the endpoint before every operation.
  // Real AWS S3 omits `endpoint` (region-derived), so there is nothing to guard
  // in that path. `lookupFn` is injectable so tests can simulate DNS-based SSRF.
  private readonly lookupFn?: LookupFn;

  constructor(lookupFn?: LookupFn) {
    this.lookupFn = lookupFn;
  }

  // Validates a user-supplied custom endpoint against the SSRF guard. No-op when
  // the connection uses the default AWS endpoint (no `endpoint` configured).
  async assertEndpointAllowed(connection: DecryptedConnection<S3CustomConfig>): Promise<void> {
    const endpoint = connection.config.endpoint;
    if (!endpoint) return;
    await assertUrlAllowed(endpoint, this.lookupFn);
  }

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
    await this.assertEndpointAllowed(args.connection);
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
    await this.assertEndpointAllowed(args.connection);
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

  async getObject(args: {
    connection: DecryptedConnection<S3CustomConfig>;
    bucket: string;
    key: string;
  }): Promise<S3GetResult> {
    await this.assertEndpointAllowed(args.connection);
    const client = this.buildClient(args.connection);
    const result = await client.send(new GetObjectCommand({ Bucket: args.bucket, Key: args.key }));

    // transformToByteArray() drains the stream into memory — acceptable for the
    // size-capped download node; the action enforces the byte ceiling upstream.
    const bytes = result.Body ? await result.Body.transformToByteArray() : new Uint8Array(0);
    client.destroy();

    return {
      bucket: args.bucket,
      key: args.key,
      body: Buffer.from(bytes).toString('base64'),
      contentType: result.ContentType ?? null,
      contentLength: result.ContentLength ?? null,
      etag: result.ETag ?? null,
      metadata: result.Metadata ?? {},
    };
  }

  async listObjects(args: {
    connection: DecryptedConnection<S3CustomConfig>;
    bucket: string;
    prefix?: string;
    continuationToken?: string;
    maxKeys?: number;
  }): Promise<S3ListResult> {
    await this.assertEndpointAllowed(args.connection);
    const client = this.buildClient(args.connection);
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: args.bucket,
        Prefix: args.prefix,
        ContinuationToken: args.continuationToken,
        MaxKeys: args.maxKeys,
      }),
    );
    client.destroy();

    const objects: S3ListItem[] = (result.Contents ?? []).map((o) => ({
      key: o.Key ?? '',
      size: o.Size ?? null,
      lastModified: o.LastModified ? o.LastModified.toISOString() : null,
      etag: o.ETag ?? null,
    }));

    return {
      objects,
      isTruncated: result.IsTruncated ?? false,
      nextCursor: result.NextContinuationToken ?? null,
      keyCount: result.KeyCount ?? objects.length,
    };
  }

  async deleteObject(args: {
    connection: DecryptedConnection<S3CustomConfig>;
    bucket: string;
    key: string;
  }): Promise<S3DeleteResult> {
    await this.assertEndpointAllowed(args.connection);
    const client = this.buildClient(args.connection);
    const result = await client.send(
      new DeleteObjectCommand({ Bucket: args.bucket, Key: args.key }),
    );
    client.destroy();

    return {
      bucket: args.bucket,
      key: args.key,
      deleted: true,
      versionId: result.VersionId ?? null,
    };
  }

  // Generates a time-limited signed URL for a GET (download) or PUT (upload)
  // without exposing the connection credentials. The URL is computed locally
  // by the presigner — no network round-trip — so there is no auth error path.
  async getPresignedUrl(args: {
    connection: DecryptedConnection<S3CustomConfig>;
    bucket: string;
    key: string;
    operation: 'get' | 'put';
    expiresIn: number;
    contentType?: string;
  }): Promise<string> {
    const client = this.buildClient(args.connection);
    const command =
      args.operation === 'put'
        ? new PutObjectCommand({
            Bucket: args.bucket,
            Key: args.key,
            ContentType: args.contentType,
          })
        : new GetObjectCommand({ Bucket: args.bucket, Key: args.key });

    const url = await getSignedUrl(client, command, { expiresIn: args.expiresIn });
    client.destroy();
    return url;
  }
}
