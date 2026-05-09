import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { NotionOAuth2Config } from '@tietide/shared';
import { NotionCreatePageAction } from './notion-create-page';
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
    parentDatabaseId: DB_ID,
    properties: { Name: { title: [{ text: { content: 'Hello' } }] } },
    ...overrides,
  },
});

describe('NotionCreatePageAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: NotionCreatePageAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new NotionCreatePageAction(client as unknown as NotionClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('notion-create-page');
    expect(action.requiredConnectionType).toBe('notion');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('POSTs to /v1/pages and returns id/url', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          id: 'page-id-123',
          url: 'https://notion.so/page-id-123',
          parent: { database_id: DB_ID },
          created_time: '2026-05-08T12:00:00.000Z',
        },
      } as NotionResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      expect(call).toHaveBeenCalledTimes(1);
      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/v1/pages');
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({
        parent: { database_id: DB_ID },
        properties: { Name: { title: [{ text: { content: 'Hello' } }] } },
      });
      expect(result.data).toEqual({
        id: 'page-id-123',
        url: 'https://notion.so/page-id-123',
        parentDatabaseId: DB_ID,
        createdTime: '2026-05-08T12:00:00.000Z',
      });
    });

    it('passes children blocks through', async () => {
      call.mockResolvedValue({ status: 200, data: { id: 'p1' } } as NotionResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const children = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }];
      await action.execute(makeInput({ children }), ctx);
      const [, , init] = call.mock.calls[0];
      const payload = JSON.parse(init.body as string);
      expect(payload.children).toEqual(children);
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

    it('rethrows non-auth Notion errors verbatim (400)', async () => {
      call.mockRejectedValue(new NotionHttpError(400, { code: 'validation_error' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(NotionHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed parentDatabaseId before hitting Notion', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ parentDatabaseId: 'not-a-notion-id' }), ctx),
      ).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data without hitting Notion when isDryRun + mockOnDryRun', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(call).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
