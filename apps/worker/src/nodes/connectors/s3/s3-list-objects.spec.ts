import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { S3CustomConfig } from '@tietide/shared';
import { S3ListObjectsAction } from './s3-list-objects';
import type { S3ClientFactory } from './s3-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (listObjects: jest.Mock = jest.fn()) =>
  ({ listObjects, buildClient: jest.fn() }) as unknown as S3ClientFactory;

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
  params: { connectionId: VALID_CONNECTION_ID, bucket: 'my-bucket', ...overrides },
});

describe('S3ListObjectsAction', () => {
  let listObjects: jest.Mock;
  let action: S3ListObjectsAction;

  beforeEach(() => {
    listObjects = jest.fn();
    action = new S3ListObjectsAction(makeClient(listObjects));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('s3-list-objects');
    expect(action.requiredConnectionType).toBe('s3');
  });

  describe('pagination', () => {
    it('passes the continuation token in and returns the next cursor out', async () => {
      listObjects.mockResolvedValue({
        objects: [{ key: 'a' }, { key: 'b' }],
        isTruncated: true,
        nextCursor: 'TOKEN-2',
        keyCount: 2,
      });

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ prefix: 'logs/', continuationToken: 'TOKEN-1', maxKeys: 2 }),
        ctx,
      );

      expect(listObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'my-bucket',
          prefix: 'logs/',
          continuationToken: 'TOKEN-1',
          maxKeys: 2,
        }),
      );
      expect(result.data.count).toBe(2);
      expect(result.data.isTruncated).toBe(true);
      expect(result.data.nextCursor).toBe('TOKEN-2');
    });

    it('returns nextCursor=null when the listing is complete', async () => {
      listObjects.mockResolvedValue({
        objects: [{ key: 'a' }],
        isTruncated: false,
        nextCursor: null,
        keyCount: 1,
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);
      expect(result.data.nextCursor).toBeNull();
    });
  });

  describe('error handling', () => {
    it('rethrows errors (S3 connections carry no refresh token)', async () => {
      listObjects.mockRejectedValue(Object.assign(new Error('Access Denied'), { status: 403 }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toThrow('Access Denied');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects maxKeys above 1000', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ maxKeys: 5000 }), ctx)).rejects.toThrow();
      expect(listObjects).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('skips the listing on dry-run + mockOnDryRun', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(listObjects).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
