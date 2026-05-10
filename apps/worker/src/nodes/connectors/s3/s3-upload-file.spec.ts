import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { S3CustomConfig } from '@tietide/shared';
import { S3UploadFileAction } from './s3-upload-file';
import type { S3ClientFactory } from './s3-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (putObject: jest.Mock = jest.fn(), uploadStream: jest.Mock = jest.fn()) =>
  ({
    putObject,
    uploadStream,
    buildClient: jest.fn(),
  }) as unknown as S3ClientFactory;

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeConnection = (): DecryptedConnection<S3CustomConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'CUSTOM',
  provider: 's3',
  config: {
    accessKeyId: 'AKIA',
    secretAccessKey: 'secret',
    region: 'us-east-1',
  },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    bucket: 'my-bucket',
    key: 'path/to/file.txt',
    content: 'small content',
    ...overrides,
  },
});

describe('S3UploadFileAction', () => {
  let putObject: jest.Mock;
  let uploadStream: jest.Mock;
  let action: S3UploadFileAction;

  beforeEach(() => {
    putObject = jest.fn();
    uploadStream = jest.fn();
    action = new S3UploadFileAction(makeClient(putObject, uploadStream));
  });

  it('declares correct type', () => {
    expect(action.type).toBe('s3-upload-file');
    expect(action.requiredConnectionType).toBe('s3');
  });

  describe('streaming behavior', () => {
    it('uses PutObjectCommand for small content (< 5 MiB)', async () => {
      putObject.mockResolvedValue({
        bucket: 'my-bucket',
        key: 'path/to/file.txt',
        etag: '"etag-1"',
        location: null,
        versionId: null,
        via: 'put-object',
      });

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      expect(putObject).toHaveBeenCalledTimes(1);
      expect(uploadStream).not.toHaveBeenCalled();
      expect(result.data.via).toBe('put-object');
      expect(result.data.etag).toBe('"etag-1"');
    });

    it('uses multipart Upload streaming for large content (>= 5 MiB)', async () => {
      const big = 'a'.repeat(5 * 1024 * 1024); // exactly 5 MiB
      uploadStream.mockResolvedValue({
        bucket: 'my-bucket',
        key: 'big-file',
        etag: '"etag-multipart"',
        location: 'https://my-bucket.s3.amazonaws.com/big-file',
        versionId: null,
        via: 'multipart-upload',
      });

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ key: 'big-file', content: big }), ctx);

      expect(uploadStream).toHaveBeenCalledTimes(1);
      expect(putObject).not.toHaveBeenCalled();
      expect(result.data.via).toBe('multipart-upload');
      expect(result.data.size).toBe(5 * 1024 * 1024);
    });

    it('decodes base64 content before sizing the upload', async () => {
      // 6 MiB of 0xff bytes; 8 MiB of base64 chars — base64 input crosses 5 MiB
      // when decoded. Verify we route the decoded size through the streaming path.
      const decodedSize = 6 * 1024 * 1024;
      const big = Buffer.alloc(decodedSize, 0xff).toString('base64');
      uploadStream.mockResolvedValue({
        bucket: 'my-bucket',
        key: 'binary',
        etag: 'e',
        location: null,
        versionId: null,
        via: 'multipart-upload',
      });

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(
        makeInput({
          key: 'binary',
          content: big,
          contentEncoding: 'base64',
          contentType: 'application/octet-stream',
        }),
        ctx,
      );

      expect(uploadStream).toHaveBeenCalledTimes(1);
      const call = uploadStream.mock.calls[0][0];
      expect(call.body.length).toBe(decodedSize);
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed bucket name', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ bucket: 'BAD!' }), ctx)).rejects.toThrow();
      expect(putObject).not.toHaveBeenCalled();
    });

    it('rejects empty key', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ key: '' }), ctx)).rejects.toThrow();
      expect(putObject).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('skips both upload paths on dry-run + mockOnDryRun', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(putObject).not.toHaveBeenCalled();
      expect(uploadStream).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
