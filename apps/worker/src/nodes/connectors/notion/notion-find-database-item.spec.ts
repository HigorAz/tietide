import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { NotionOAuth2Config } from '@tietide/shared';
import { NotionFindDatabaseItemAction } from './notion-find-database-item';
import {
  NotionHttpError,
  type NotionClientFactory,
  type NotionResponse,
} from './notion-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const DB_ID = '0123456789abcdef0123456789abcdef';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<
  Pick<NotionClientFactory, 'call' | 'baseUrl' | 'notionVersion' | 'buildAuthHeaders'>
> => ({
  call,
  baseUrl: jest.fn(),
  notionVersion: jest.fn(),
  buildAuthHeaders: jest.fn(),
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

const makeConnection = (
  overrides: Partial<DecryptedConnection<NotionOAuth2Config>> = {},
): DecryptedConnection<NotionOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'notion',
  config: { accessToken: 'secret_valid', workspaceId: 'ws_1' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    databaseId: DB_ID,
    filter: { property: 'Email', email: { equals: 'a@b.com' } },
    ...overrides,
  },
});

describe('NotionFindDatabaseItemAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: NotionFindDatabaseItemAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new NotionFindDatabaseItemAction(client as unknown as NotionClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('notion-find-database-item');
    expect(action.requiredConnectionType).toBe('notion');
  });

  describe('happy path', () => {
    it('POSTs the query with filter + page_size 1 and returns the first match', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { results: [{ id: 'row-1' }, { id: 'row-2' }] },
      } as NotionResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/v1/databases/${DB_ID}/query`);
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload.page_size).toBe(1);
      expect(payload.filter).toEqual({ property: 'Email', email: { equals: 'a@b.com' } });
      expect(result.data).toMatchObject({ found: true, id: 'row-1' });
    });

    it('reports found=false when no item matches', async () => {
      call.mockResolvedValue({ status: 200, data: { results: [] } } as NotionResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);
      expect(result.data).toMatchObject({ found: false, id: null, item: null });
    });
  });

  describe('auth and error handling', () => {
    it('rethrows NotionHttpError(401) verbatim when no refresh token', async () => {
      call.mockRejectedValue(new NotionHttpError(401, { code: 'unauthorized' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(NotionHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('marks for refresh and wraps in ConnectionAuthError when refresh token present', async () => {
      call.mockRejectedValue(new NotionHttpError(401, { code: 'unauthorized' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt-present' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });

  describe('schema rejection', () => {
    it('rejects a malformed databaseId before hitting Notion', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ databaseId: 'bad' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
