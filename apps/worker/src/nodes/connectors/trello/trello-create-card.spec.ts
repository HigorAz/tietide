import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloCreateCardAction } from './trello-create-card';
import {
  TrelloHttpError,
  type TrelloClientFactory,
  type TrelloResponse,
} from './trello-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const LIST_ID = '0123456789abcdef01234567';

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
    listId: LIST_ID,
    name: 'My new card',
    ...overrides,
  },
});

describe('TrelloCreateCardAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: TrelloCreateCardAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new TrelloCreateCardAction(client as unknown as TrelloClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('trello-create-card');
    expect(action.requiredConnectionType).toBe('trello');
  });

  describe('happy path', () => {
    it('POSTs to /1/cards and returns id/url/listId', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          id: 'card-id-1',
          shortUrl: 'https://trello.com/c/abc',
          idList: LIST_ID,
          idBoard: 'board-1',
        },
      } as TrelloResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ desc: 'optional' }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/1/cards');
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({ idList: LIST_ID, name: 'My new card', desc: 'optional' });
      expect(result.data).toEqual({
        id: 'card-id-1',
        url: 'https://trello.com/c/abc',
        listId: LIST_ID,
        boardId: 'board-1',
      });
    });

    it('joins idMembers / idLabels arrays into comma-separated query values', async () => {
      call.mockResolvedValue({ status: 200, data: { id: 'c1' } } as TrelloResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(
        makeInput({
          idMembers: ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'],
          idLabels: ['cccccccccccccccccccccccc'],
        }),
        ctx,
      );
      const [, , init] = call.mock.calls[0];
      const payload = JSON.parse(init.body as string);
      expect(payload.idMembers).toBe('aaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbb');
      expect(payload.idLabels).toBe('cccccccccccccccccccccccc');
    });
  });

  describe('error handling', () => {
    it('rethrows TrelloHttpError on 4xx (no refresh; api-key has none)', async () => {
      call.mockRejectedValue(new TrelloHttpError(401, 'invalid key'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TrelloHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed listId', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ listId: 'short' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data on dry-run', async () => {
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
