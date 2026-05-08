import { ConnectionAuthError } from '@tietide/sdk';
import {
  GmailMessageReceivedExecutor,
  GMAIL_MESSAGE_RECEIVED_TYPE,
} from './gmail-message-received.executor';
import {
  makeAuthService,
  makeClients,
  makeConnection,
  makeContext,
  VALID_CONNECTION_ID,
  authError,
} from '../../connectors/google/__test__/fixtures';

describe('GmailMessageReceivedExecutor', () => {
  let executor: GmailMessageReceivedExecutor;
  let authService: ReturnType<typeof makeAuthService>;
  let historyList: jest.Mock;
  let messagesGet: jest.Mock;

  beforeEach(() => {
    historyList = jest.fn();
    messagesGet = jest.fn();
    authService = makeAuthService();
    const gmailClient = {
      users: {
        history: { list: historyList },
        messages: { get: messagesGet },
      },
    };
    executor = new GmailMessageReceivedExecutor(
      authService as never,
      makeClients({ gmail: gmailClient }),
    );
  });

  const ENCODED_HISTORY = Buffer.from(
    JSON.stringify({ emailAddress: 'user@example.com', historyId: '500' }),
  ).toString('base64');

  const makeInput = (overrides: { data?: Record<string, unknown> } = {}) => ({
    data: { message: { data: ENCODED_HISTORY, messageId: 'msg-1' } } as Record<string, unknown>,
    params: { connectionId: VALID_CONNECTION_ID },
    connectionId: VALID_CONNECTION_ID,
    ...overrides,
  });

  it('exposes the canonical type string and category=trigger', () => {
    expect(GMAIL_MESSAGE_RECEIVED_TYPE).toBe('gmail-message-received');
    expect(executor.type).toBe('gmail-message-received');
    expect(executor.category).toBe('trigger');
  });

  it('decodes the Pub/Sub payload, walks history.list, fetches each message, and returns them', async () => {
    historyList.mockResolvedValue({
      data: {
        historyId: '550',
        history: [
          {
            id: '510',
            messagesAdded: [{ message: { id: 'msg-A', threadId: 'thr-A' } }],
          },
          {
            id: '530',
            messagesAdded: [{ message: { id: 'msg-B', threadId: 'thr-B' } }],
          },
        ],
      },
    });
    messagesGet.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({
        data: {
          id,
          threadId: `thr-${id.slice(-1)}`,
          labelIds: ['INBOX'],
          snippet: `body of ${id}`,
          payload: { headers: [{ name: 'From', value: `${id}@x.test` }] },
        },
      }),
    );

    const out = await executor.execute(makeInput(), makeContext());

    expect(historyList).toHaveBeenCalledWith({
      userId: 'me',
      startHistoryId: '500',
      historyTypes: ['messageAdded'],
    });
    expect(messagesGet).toHaveBeenCalledTimes(2);
    expect(out.data.historyId).toBe('500');
    const messages = out.data.messages as Array<{ id: string; from: string }>;
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.id)).toEqual(['msg-A', 'msg-B']);
  });

  it('returns an empty messages array when history is empty', async () => {
    historyList.mockResolvedValue({ data: { historyId: '500', history: [] } });

    const out = await executor.execute(makeInput(), makeContext());

    expect(out.data.messages).toEqual([]);
    expect(messagesGet).not.toHaveBeenCalled();
  });

  it('marks the connection for refresh and throws ConnectionAuthError on 401', async () => {
    historyList.mockRejectedValue(authError(401));
    const ctx = makeContext();

    await expect(executor.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
  });

  it('throws when input.data.message.data is missing/malformed', async () => {
    await expect(
      executor.execute(makeInput({ data: { message: {} } }) as never, makeContext()),
    ).rejects.toThrow(/message\.data/);
  });

  it('throws when input.connectionId is missing', async () => {
    const input = makeInput();
    delete (input as { connectionId?: string }).connectionId;

    await expect(executor.execute(input as never, makeContext())).rejects.toThrow(/connectionId/);
  });

  it('returns empty messages with a warning when history.list returns 404 (historyId aged out)', async () => {
    const err = Object.assign(new Error('Requested entity not found'), {
      response: { status: 404 },
    });
    historyList.mockRejectedValue(err);

    const out = await executor.execute(makeInput(), makeContext());

    expect(out.data.messages).toEqual([]);
    expect(out.metadata?.historyExpired).toBe(true);
  });
});
