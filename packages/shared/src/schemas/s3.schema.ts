import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// S3 bucket name rules: 3-63 chars, lowercase alphanumeric + hyphens + dots,
// must start and end with alphanumeric. (Subset of the full DNS-bucket rules
// — sufficient for validation; AWS will reject anything truly invalid.)
const s3BucketName = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, {
    message: 'bucket must be lowercase alphanumeric with optional dots/hyphens',
  });

// S3 keys can be up to 1024 bytes; we cap at 1024 chars to stay under that bound.
const s3Key = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[^\x00-\x1f]+$/, { message: 'key must not contain control characters' });

const S3_MAX_BYTES = 100 * 1024 * 1024; // 100 MiB hard cap on a single upload

export const s3UploadFileConfigSchema = z.object({
  connectionId,
  bucket: s3BucketName,
  key: s3Key,
  // Content is provided either as a UTF-8 string OR a base64-encoded blob.
  // For >5 MB content we use multipart Upload streaming via @aws-sdk/lib-storage.
  content: z.string().min(0).max(S3_MAX_BYTES),
  contentEncoding: z.union([z.literal('utf8'), z.literal('base64')]).default('utf8'),
  contentType: z.string().min(1).max(255).default('application/octet-stream'),
  cacheControl: z.string().max(255).optional(),
  metadata: z
    .record(
      z
        .string()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9_-]+$/, { message: 'metadata key must be alphanumeric/_/-' }),
      z.string().max(2048),
    )
    .optional()
    .refine(
      (v) => v === undefined || Object.keys(v).length <= 10,
      'too many user-metadata entries (>10)',
    ),
  mockOnDryRun,
});
export type S3UploadFileConfig = z.infer<typeof s3UploadFileConfigSchema>;

// Threshold above which the action MUST stream via @aws-sdk/lib-storage Upload
// instead of buffering with PutObjectCommand. AWS multipart minimum part is 5 MiB.
export const S3_STREAMING_THRESHOLD_BYTES = 5 * 1024 * 1024;

// --- S15 commerce/data/storage read/update pack (#246) ---

export const s3DownloadFileConfigSchema = z.object({
  connectionId,
  bucket: s3BucketName,
  key: s3Key,
  mockOnDryRun,
});
export type S3DownloadFileConfig = z.infer<typeof s3DownloadFileConfigSchema>;

export const s3ListObjectsConfigSchema = z.object({
  connectionId,
  bucket: s3BucketName,
  prefix: z.string().max(1024).optional(),
  // Opaque continuation token from a previous page's response.
  continuationToken: z.string().max(4096).optional(),
  maxKeys: z.number().int().min(1).max(1000).default(100),
  mockOnDryRun,
});
export type S3ListObjectsConfig = z.infer<typeof s3ListObjectsConfigSchema>;

export const s3DeleteObjectConfigSchema = z.object({
  connectionId,
  bucket: s3BucketName,
  key: s3Key,
  mockOnDryRun,
});
export type S3DeleteObjectConfig = z.infer<typeof s3DeleteObjectConfigSchema>;

// Max presigned-URL lifetime is 7 days (604800s) per the AWS SigV4 spec.
export const S3_MAX_PRESIGN_EXPIRY_SECONDS = 604_800;
export const s3GetPresignedUrlConfigSchema = z.object({
  connectionId,
  bucket: s3BucketName,
  key: s3Key,
  operation: z.union([z.literal('get'), z.literal('put')]).default('get'),
  expiresIn: z.number().int().min(1).max(S3_MAX_PRESIGN_EXPIRY_SECONDS).default(3600),
  contentType: z.string().min(1).max(255).optional(),
  mockOnDryRun,
});
export type S3GetPresignedUrlConfig = z.infer<typeof s3GetPresignedUrlConfigSchema>;
