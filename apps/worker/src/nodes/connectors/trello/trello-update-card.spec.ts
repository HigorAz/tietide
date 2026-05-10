import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloUpdateCardAction } from './trello-update-card';
import {
  TrelloHttpError,
  type TrelloClientFactory,
  type TrelloResponse,
} from './trello-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const CARD_ID = '0123456789abcdef01234567';
const LIST_ID = 'fedcba9876543210fedcba98';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({ call, baseUrl: jest.fn() }) as unknown as TrelloClientFactory;

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeConnection = (): DecryptedConnection<TrelloApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'trello',
  config: { apiKey: 'devkey', token: 'usertoken' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    cardId: CARD_ID,
    ...overrides,
  },
});

describe('TrelloUpdateCardAction', () => {
  let call: jest.Mock;
  let action: TrelloUpdateCardAction;

  beforeEach(() => {
    call = jest.fn();
    action = new TrelloUpdateCardAction(makeClient(call));
  });

  it('declares correct type', () => {
    expect(action.type).toBe('trello-update-card');
    expect(action.requiredConnectionType).toBe('trello');
  });

  it('PUTs to /1/cards/:id with provided fields', async () => {
    call.mockResolvedValue({
      status: 200,
      data: { id: CARD_ID, name: 'New name', closed: false, idList: LIST_ID },
    } as TrelloResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(makeInput({ name: 'New name', closed: false, idList: LIST_ID }), ctx);

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe(`/1/cards/${CARD_ID}`);
    expect(init.method).toBe('PUT');
    expect(init.query).toEqual({ name: 'New name', closed: false, idList: LIST_ID });
  });

  it('encodes due:null as empty string (Trello clears the due date)', async () => {
    call.mockResolvedValue({ status: 200, data: { id: CARD_ID } } as TrelloResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(makeInput({ due: null }), ctx);
    const [, , init] = call.mock.calls[0];
    expect(init.query.due).toBe('');
  });

  it('omits unspecified fields entirely', async () => {
    call.mockResolvedValue({ status: 200, data: { id: CARD_ID } } as TrelloResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(makeInput(), ctx);
    const [, , init] = call.mock.calls[0];
    expect(init.query).toEqual({});
  });

  it('rejects malformed cardId', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ cardId: 'short' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rethrows non-auth errors', async () => {
    call.mockRejectedValue(new TrelloHttpError(500, 'down'));
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ name: 'x' }), ctx)).rejects.toBeInstanceOf(
      TrelloHttpError,
    );
  });

  it('returns mocked data on dry-run', async () => {
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
