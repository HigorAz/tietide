import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { NotionOAuth2Config } from '@tietide/shared';
import { NotionGetBlockChildrenAction } from './notion-get-block-children';
import {
  NotionHttpError,
  type NotionClientFactory,
  type NotionResponse,
} from './notion-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const BLOCK_ID = '0123456789abcdef0123456789abcdef';

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
  params: { connectionId: VALID_CONNECTION_ID, blockId: BLOCK_ID, ...overrides },
});

describe('NotionGetBlockChildrenAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: NotionGetBlockChildrenAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new NotionGetBlockChildrenAction(client as unknown as NotionClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('notion-get-block-children');
    expect(action.requiredConnectionType).toBe('notion');
  });

  describe('happy path', () => {
    it('GETs the children endpoint and maps results without pagination args', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { results: [{ id: 'b1' }], has_more: false, next_cursor: null },
      } as NotionResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/v1/blocks/${BLOCK_ID}/children`);
      expect(init.method).toBe('GET');
      expect(result.data).toMatchObject({ count: 1, hasMore: false, nextCursor: null });
    });

    it('paginates: encodes page_size and start_cursor and surfaces next_cursor/has_more', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { results: [{ id: 'b2' }], has_more: true, next_cursor: 'cursor-2' },
      } as NotionResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ pageSize: 50, startCursor: 'cursor-1' }),
        ctx,
      );

      const [, path] = call.mock.calls[0];
      expect(path).toContain(`/v1/blocks/${BLOCK_ID}/children?`);
      expect(path).toContain('page_size=50');
      expect(path).toContain('start_cursor=cursor-1');
      expect(result.data).toMatchObject({ hasMore: true, nextCursor: 'cursor-2' });
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
    it('rejects pageSize > 100 before hitting Notion', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ pageSize: 101 }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
