import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { S3CustomConfig } from '@tietide/shared';
import { S3DeleteObjectAction } from './s3-delete-object';
import type { S3ClientFactory } from './s3-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (deleteObject: jest.Mock = jest.fn()) =>
  ({ deleteObject, buildClient: jest.fn() }) as unknown as S3ClientFactory;

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

describe('S3DeleteObjectAction', () => {
  let deleteObject: jest.Mock;
  let action: S3DeleteObjectAction;

  beforeEach(() => {
    deleteObject = jest.fn();
    action = new S3DeleteObjectAction(makeClient(deleteObject));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('s3-delete-object');
    expect(action.requiredConnectionType).toBe('s3');
  });

  describe('happy path', () => {
    it('deletes the object and returns deleted=true', async () => {
      deleteObject.mockResolvedValue({
        bucket: 'my-bucket',
        key: 'path/file.txt',
        deleted: true,
        versionId: null,
      });

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      expect(deleteObject).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'my-bucket', key: 'path/file.txt' }),
      );
      expect(result.data.deleted).toBe(true);
    });
  });

  describe('error handling', () => {
    it('rethrows errors (S3 connections carry no refresh token)', async () => {
      deleteObject.mockRejectedValue(Object.assign(new Error('Access Denied'), { status: 403 }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toThrow('Access Denied');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects an empty key', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ key: '' }), ctx)).rejects.toThrow();
      expect(deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('skips the delete on dry-run + mockOnDryRun', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(deleteObject).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
