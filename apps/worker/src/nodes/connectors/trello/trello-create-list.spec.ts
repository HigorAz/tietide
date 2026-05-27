import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloCreateListAction } from './trello-create-list';
import {
  TrelloHttpError,
  type TrelloClientFactory,
  type TrelloResponse,
} from './trello-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '5abbe4b7ddc1b351ef961426';

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
  params: { connectionId: VALID_CONNECTION_ID, boardId: BOARD_ID, name: 'Backlog', ...overrides },
});

describe('TrelloCreateListAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: TrelloCreateListAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new TrelloCreateListAction(client as unknown as TrelloClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('trello-create-list');
    expect(action.requiredConnectionType).toBe('trello');
  });

  describe('happy path', () => {
    it('POSTs /1/lists with name + idBoard', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: 'list-1', name: 'Backlog', idBoard: BOARD_ID, pos: 16384 },
      } as TrelloResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ pos: 'top' }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/1/lists');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        name: 'Backlog',
        idBoard: BOARD_ID,
        pos: 'top',
      });
      expect(result.data).toMatchObject({ id: 'list-1', boardId: BOARD_ID });
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
    it('rejects an empty name before hitting Trello', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ name: '' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data without hitting Trello on a dry run', async () => {
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
