import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloAddCommentAction } from './trello-add-comment';
import {
  TrelloHttpError,
  type TrelloClientFactory,
  type TrelloResponse,
} from './trello-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const CARD_ID = '0123456789abcdef01234567';

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
    text: 'hello world',
    ...overrides,
  },
});

describe('TrelloAddCommentAction', () => {
  let call: jest.Mock;
  let action: TrelloAddCommentAction;

  beforeEach(() => {
    call = jest.fn();
    action = new TrelloAddCommentAction(makeClient(call));
  });

  it('declares correct type', () => {
    expect(action.type).toBe('trello-add-comment');
    expect(action.requiredConnectionType).toBe('trello');
  });

  it('POSTs to /1/cards/:id/actions/comments with text query param', async () => {
    call.mockResolvedValue({
      status: 200,
      data: { id: 'comment-1', data: { text: 'hello world', card: { id: CARD_ID } } },
    } as TrelloResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe(`/1/cards/${CARD_ID}/actions/comments`);
    expect(init.method).toBe('POST');
    expect(init.query.text).toBe('hello world');
    expect(result.data.id).toBe('comment-1');
  });

  it('rejects malformed cardId', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ cardId: 'short' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rejects empty text', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ text: '' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rethrows non-auth errors', async () => {
    call.mockRejectedValue(new TrelloHttpError(500, 'down'));
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TrelloHttpError);
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
