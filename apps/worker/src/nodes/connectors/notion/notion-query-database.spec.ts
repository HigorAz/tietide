import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { NotionOAuth2Config } from '@tietide/shared';
import { NotionQueryDatabaseAction } from './notion-query-database';
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
  params: { connectionId: VALID_CONNECTION_ID, databaseId: DB_ID, ...overrides },
});

describe('NotionQueryDatabaseAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: NotionQueryDatabaseAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new NotionQueryDatabaseAction(client as unknown as NotionClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('notion-query-database');
    expect(action.requiredConnectionType).toBe('notion');
  });

  describe('happy path', () => {
    it('POSTs to /v1/databases/:id/query and maps results', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          results: [{ id: 'r1' }, { id: 'r2' }],
          next_cursor: 'cursor-2',
          has_more: true,
        },
      } as NotionResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ filter: { property: 'Status', status: { equals: 'Done' } }, pageSize: 25 }),
        ctx,
      );

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/v1/databases/${DB_ID}/query`);
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({
        filter: { property: 'Status', status: { equals: 'Done' } },
        page_size: 25,
      });
      expect(result.data).toEqual({
        results: [{ id: 'r1' }, { id: 'r2' }],
        nextCursor: 'cursor-2',
        hasMore: true,
        count: 2,
      });
    });

    it('omits unset filter/sorts/cursor', async () => {
      call.mockResolvedValue({ status: 200, data: { results: [] } } as NotionResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput(), ctx);
      const [, , init] = call.mock.calls[0];
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({});
    });
  });

  describe('auth and error handling', () => {
    it('marks for refresh on 403 when refresh token present', async () => {
      call.mockRejectedValue(new NotionHttpError(403, { code: 'restricted_resource' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt-present' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim', async () => {
      call.mockRejectedValue(new NotionHttpError(404, { code: 'object_not_found' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(NotionHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects pageSize > 100', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ pageSize: 101 }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
