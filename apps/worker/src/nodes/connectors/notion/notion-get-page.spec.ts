import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { NotionOAuth2Config } from '@tietide/shared';
import { NotionGetPageAction } from './notion-get-page';
import {
  NotionHttpError,
  type NotionClientFactory,
  type NotionResponse,
} from './notion-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const PAGE_ID = '0123456789abcdef0123456789abcdef';

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
  params: { connectionId: VALID_CONNECTION_ID, pageId: PAGE_ID, ...overrides },
});

describe('NotionGetPageAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: NotionGetPageAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new NotionGetPageAction(client as unknown as NotionClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('notion-get-page');
    expect(action.requiredConnectionType).toBe('notion');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('GETs /v1/pages/:id and maps the response', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          id: PAGE_ID,
          url: 'https://notion.so/page',
          properties: { Name: { title: [] } },
          archived: false,
          last_edited_time: '2026-05-08T12:00:00.000Z',
        },
      } as NotionResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/v1/pages/${PAGE_ID}`);
      expect(init.method).toBe('GET');
      expect(result.data).toMatchObject({
        id: PAGE_ID,
        url: 'https://notion.so/page',
        properties: { Name: { title: [] } },
        archived: false,
        lastEditedTime: '2026-05-08T12:00:00.000Z',
      });
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
      call.mockRejectedValue(new NotionHttpError(403, { code: 'restricted_resource' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt-present' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });

  describe('schema rejection', () => {
    it('rejects a malformed pageId before hitting Notion', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ pageId: 'nope' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
