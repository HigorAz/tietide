import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { S3CustomConfig } from '@tietide/shared';
import { S3GetPresignedUrlAction } from './s3-get-presigned-url';
import type { S3ClientFactory } from './s3-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (getPresignedUrl: jest.Mock = jest.fn()) =>
  ({ getPresignedUrl, buildClient: jest.fn() }) as unknown as S3ClientFactory;

const makeContext = (
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext & { markConnectionForRefresh: jest.Mock } => {
  const ctx = {
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return ctx as unknown as ExecutionContext & { markConnectionForRefresh: jest.Mock };
};

const makeConnection = (): DecryptedConnection<S3CustomConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'CUSTOM',
  provider: 's3',
  config: { accessKeyId: 'AKIA', secretAccessKey: 'secret', region: 'us-east-1' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    bucket: 'my-bucket',
    key: 'path/file.txt',
    ...overrides,
  },
});

describe('S3GetPresignedUrlAction', () => {
  let getPresignedUrl: jest.Mock;
  let action: S3GetPresignedUrlAction;

  beforeEach(() => {
    getPresignedUrl = jest.fn();
    action = new S3GetPresignedUrlAction(makeClient(getPresignedUrl));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('s3-get-presigned-url');
    expect(action.requiredConnectionType).toBe('s3');
  });

  describe('happy path', () => {
    it('returns a signed URL for the default GET operation', async () => {
      getPresignedUrl.mockResolvedValue(
        'https://my-bucket.s3.amazonaws.com/path/file.txt?X-Amz-Signature=abc',
      );

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      expect(getPresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'my-bucket', key: 'path/file.txt', operation: 'get' }),
      );
      expect(result.data.url).toContain('X-Amz-Signature=');
      expect(result.data.operation).toBe('get');
    });

    it('supports a PUT presigned URL with a default expiry', async () => {
      getPresignedUrl.mockResolvedValue('https://signed-put');
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ operation: 'put' }), ctx);
      expect(getPresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'put', expiresIn: 3600 }),
      );
      expect(result.data.url).toBe('https://signed-put');
    });
  });

  describe('schema rejection', () => {
    it('rejects an expiry above the 7-day maximum', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ expiresIn: 999_999_999 }), ctx)).rejects.toThrow();
      expect(getPresignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('skips signing on dry-run + mockOnDryRun', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(getPresignedUrl).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
