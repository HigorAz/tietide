import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloListCardsAction } from './trello-list-cards';
import {
  TrelloHttpError,
  type TrelloClientFactory,
  type TrelloResponse,
} from './trello-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const CONTAINER_ID = '5abbe4b7ddc1b351ef961426';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<TrelloClientFactory, 'call' | 'baseUrl'>> => ({
  call,
  baseUrl: jest.fn(),
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
  overrides: Partial<DecryptedConnection<TrelloApiKeyConfig>> = {},
): DecryptedConnection<TrelloApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'trello',
  config: { apiKey: 'key_valid', token: 'tok_valid' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    source: 'board',
    containerId: CONTAINER_ID,
    ...overrides,
  },
});

describe('TrelloListCardsAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: TrelloListCardsAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new TrelloListCardsAction(client as unknown as TrelloClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('trello-list-cards');
    expect(action.requiredConnectionType).toBe('trello');
  });

  describe('happy path', () => {
    it('lists cards from a board', async () => {
      call.mockResolvedValue({
        status: 200,
        data: [{ id: 'c1' }, { id: 'c2' }],
      } as TrelloResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/1/boards/${CONTAINER_ID}/cards`);
      expect(init.method).toBe('GET');
      expect(result.data.count).toBe(2);
    });

    it('lists cards from a list when source=list', async () => {
      call.mockResolvedValue({ status: 200, data: [{ id: 'c1' }] } as TrelloResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ source: 'list' }), ctx);
      const [, path] = call.mock.calls[0];
      expect(path).toBe(`/1/lists/${CONTAINER_ID}/cards`);
    });
  });

  describe('auth and error handling', () => {
    it('rethrows TrelloHttpError(401) verbatim when no refresh token', async () => {
      call.mockRejectedValue(new TrelloHttpError(401, 'unauthorized'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TrelloHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('marks for refresh and wraps in ConnectionAuthError when refresh token present', async () => {
      call.mockRejectedValue(new TrelloHttpError(401, 'unauthorized'));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt-present' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });

  describe('schema rejection', () => {
    it('rejects an invalid source value before hitting Trello', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ source: 'card' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
