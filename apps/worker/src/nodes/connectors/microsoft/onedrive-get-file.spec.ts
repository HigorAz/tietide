import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { OnedriveGetFileAction } from './onedrive-get-file';
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
  config: { accessToken: 'at', refreshToken: 'rt', scope: 'Files.Read', tokenType: 'Bearer' },
  refreshToken: 'rt',
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, itemId: 'item-1', ...overrides },
});

const fileItem = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'item-1',
  name: 'report.pdf',
  size: 5,
  webUrl: 'https://onedrive/report.pdf',
  lastModifiedDateTime: '2026-05-26T10:00:00Z',
  file: { mimeType: 'application/pdf' },
  '@microsoft.graph.downloadUrl': 'https://dl.example.com/report.pdf',
  ...overrides,
});

describe('OnedriveGetFileAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: OnedriveGetFileAction;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new OnedriveGetFileAction(auth as unknown as MicrosoftAuthService);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('onedrive-get-file');
    expect(action.requiredConnectionType).toBe('microsoft');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('returns metadata and downloads content as base64 by default', async () => {
      graphFetch.mockResolvedValue({ status: 200, data: fileItem() } as GraphResponse);
      fetchSpy.mockResolvedValue(new Response(Buffer.from('hello')));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput(), ctx);

      const [, path] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/drive/items/item-1');
      expect(fetchSpy).toHaveBeenCalledWith('https://dl.example.com/report.pdf');
      expect(result.data).toMatchObject({
        id: 'item-1',
        name: 'report.pdf',
        size: 5,
        mimeType: 'application/pdf',
        isFolder: false,
        contentBase64: Buffer.from('hello').toString('base64'),
      });
    });

    it('returns metadata only when downloadContent is false', async () => {
      graphFetch.mockResolvedValue({ status: 200, data: fileItem() } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ downloadContent: false }), ctx);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.data.contentBase64).toBeNull();
    });

    it('does not download content for a folder item', async () => {
      graphFetch.mockResolvedValue({
        status: 200,
        data: { id: 'folder-1', name: 'Docs', folder: { childCount: 3 } },
      } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ itemId: 'folder-1' }), ctx);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.data.isFolder).toBe(true);
      expect(result.data.contentBase64).toBeNull();
    });

    it('skips content download when the file exceeds the size cap', async () => {
      graphFetch.mockResolvedValue({
        status: 200,
        data: fileItem({ size: 20 * 1024 * 1024 }),
      } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.data.contentBase64).toBeNull();
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks connection for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(401, { error: { code: 'Unauthorized' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 (permission denied)', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(403, { error: { code: 'Forbidden' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(404, { error: { message: 'gone' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GraphHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a missing itemId before Graph is called', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ itemId: undefined }), ctx)).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call graphFetch when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(graphFetch).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
