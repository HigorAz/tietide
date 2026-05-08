import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { OnedriveCreateAction } from './onedrive-create';
import type { MicrosoftAuthService, GraphResponse } from './microsoft-auth';
import { GraphHttpError } from './microsoft-auth';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeAuthService = (
  graphFetch: jest.Mock = jest.fn(),
): jest.Mocked<Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>> => ({
  graphFetch,
  buildAuthHeader: jest.fn(),
  graphBaseUrl: jest.fn(),
});

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

const makeConnection = (): DecryptedConnection<MicrosoftOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'microsoft',
  config: {
    accessToken: 'at',
    refreshToken: 'rt',
    scope: 'Files.ReadWrite',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt',
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    name: 'hello.txt',
    mimeType: 'text/plain',
    contentBase64: Buffer.from('hello world', 'utf8').toString('base64'),
    ...overrides,
  },
});

describe('OnedriveCreateAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: OnedriveCreateAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new OnedriveCreateAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('onedrive-create');
    expect(action.requiredConnectionType).toBe('microsoft');
  });

  describe('happy path', () => {
    it('PUTs to /me/drive/root:/{name}:/content when no parentFolderId is given', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: {
          id: 'file-1',
          name: 'hello.txt',
          webUrl: 'https://1drv.ms/x/file-1',
          size: 11,
        },
      } as GraphResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [, path, init] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/drive/root:/hello.txt:/content');
      expect(init.method).toBe('PUT');
      expect(init.contentType).toBe('text/plain');
      expect(Buffer.isBuffer(init.body)).toBe(true);
      expect((init.body as Buffer).toString('utf8')).toBe('hello world');

      expect(result.data).toEqual(
        expect.objectContaining({
          fileId: 'file-1',
          name: 'hello.txt',
          webUrl: 'https://1drv.ms/x/file-1',
          size: 11,
        }),
      );
    });

    it('PUTs to /me/drive/items/{parentId}:/{name}:/content when parentFolderId is provided', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'f2', name: 'hello.txt', webUrl: 'u', size: 1 },
      } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ parentFolderId: 'parent-1' }), ctx);
      const [, path] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/drive/items/parent-1:/hello.txt:/content');
    });

    it('URL-encodes special characters in the file name', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'f3', name: 'a b.txt', webUrl: 'u', size: 1 },
      } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ name: 'a b.txt' }), ctx);
      const [, path] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/drive/root:/a%20b.txt:/content');
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(401, {}));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalled();
    });

    it('rethrows non-auth errors verbatim', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(413, { error: { code: 'TooLarge' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GraphHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and skips Graph call', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(graphFetch).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });

  describe('validation (path-traversal defense)', () => {
    it('rejects names containing forward slash', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ name: 'evil/path.txt' }), ctx)).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });

    it('rejects names containing backslash', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ name: 'evil\\path.txt' }), ctx)).rejects.toThrow();
    });

    it('rejects names containing ".." traversal', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ name: '..hidden' }), ctx)).rejects.toThrow();
    });
  });
});
