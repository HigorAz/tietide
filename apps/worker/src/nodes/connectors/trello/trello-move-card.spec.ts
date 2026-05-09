import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloMoveCardAction } from './trello-move-card';
import {
  TrelloHttpError,
  type TrelloClientFactory,
  type TrelloResponse,
} from './trello-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const CARD_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TARGET_LIST_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

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

const makeConnection = (): DecryptedConnection<TrelloApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'trello',
  config: { apiKey: 'devkey1234567890', token: 'usrtoken1234567890' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    cardId: CARD_ID,
    targetListId: TARGET_LIST_ID,
    ...overrides,
  },
});

describe('TrelloMoveCardAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: TrelloMoveCardAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new TrelloMoveCardAction(client as unknown as TrelloClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('trello-move-card');
    expect(action.requiredConnectionType).toBe('trello');
  });

  describe('happy path', () => {
    it('PUTs /1/cards/:id with idList', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: CARD_ID, idList: TARGET_LIST_ID, idBoard: 'b1', shortUrl: 'https://t/c' },
      } as TrelloResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ pos: 'top' }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/1/cards/${CARD_ID}`);
      expect(init.method).toBe('PUT');
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({ idList: TARGET_LIST_ID, pos: 'top' });
      expect(result.data.listId).toBe(TARGET_LIST_ID);
    });
  });

  describe('error handling', () => {
    it('rethrows TrelloHttpError(404) verbatim', async () => {
      call.mockRejectedValue(new TrelloHttpError(404, 'card not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TrelloHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed targetListId', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ targetListId: 'too-short' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
