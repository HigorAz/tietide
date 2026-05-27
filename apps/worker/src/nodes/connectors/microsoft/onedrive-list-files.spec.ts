import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { OnedriveListFilesAction } from './onedrive-list-files';
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
  params: { connectionId: VALID_CONNECTION_ID, ...overrides },
});

const CHILDREN = {
  value: [
    {
      id: 'f1',
      name: 'report.pdf',
      size: 2048,
      file: { mimeType: 'application/pdf' },
      lastModifiedDateTime: '2026-05-26T10:00:00Z',
      webUrl: 'https://onedrive/report.pdf',
    },
    { id: 'd1', name: 'Subfolder', folder: { childCount: 2 } },
  ],
};

describe('OnedriveListFilesAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: OnedriveListFilesAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new OnedriveListFilesAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('onedrive-list-files');
    expect(action.requiredConnectionType).toBe('microsoft');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('lists the drive root when no folder is specified and maps file/folder items', async () => {
      graphFetch.mockResolvedValue({ status: 200, data: CHILDREN } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput(), ctx);

      const [, path] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/drive/root/children');
      expect(result.data.count).toBe(2);
      expect(result.data.files).toEqual([
        {
          id: 'f1',
          name: 'report.pdf',
          size: 2048,
          isFolder: false,
          mimeType: 'application/pdf',
          lastModifiedDateTime: '2026-05-26T10:00:00Z',
          webUrl: 'https://onedrive/report.pdf',
        },
        {
          id: 'd1',
          name: 'Subfolder',
          size: 0,
          isFolder: true,
          mimeType: null,
          lastModifiedDateTime: null,
          webUrl: null,
        },
      ]);
    });

    it('lists children by folder id', async () => {
      graphFetch.mockResolvedValue({ status: 200, data: { value: [] } } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ folderId: 'folder-1' }), ctx);
      const [, path] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/drive/items/folder-1/children');
    });

    it('lists children by folder path and appends $top', async () => {
      graphFetch.mockResolvedValue({ status: 200, data: { value: [] } } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ folderPath: '/Documents/Reports', top: 10 }), ctx);
      const [, path] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/drive/root:/Documents/Reports:/children?$top=10');
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
    it('rejects a folderPath containing ".." before Graph is called', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ folderPath: '../secrets' }), ctx)).rejects.toThrow();
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
