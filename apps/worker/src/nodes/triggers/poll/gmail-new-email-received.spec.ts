import { ConnectionAuthError } from '@tietide/sdk';
import { GmailNewEmailReceivedTrigger } from './gmail-new-email-received';

describe('GmailNewEmailReceivedTrigger', () => {
  let trigger: GmailNewEmailReceivedTrigger;
  let authService: { buildClient: jest.Mock };
  let clients: { gmail: jest.Mock };
  let gmailClient: {
    users: {
      getProfile: jest.Mock;
      history: { list: jest.Mock };
      messages: { get: jest.Mock; list: jest.Mock };
    };
  };

  beforeEach(() => {
    gmailClient = {
      users: {
        getProfile: jest.fn(),
        history: { list: jest.fn() },
        messages: { get: jest.fn(), list: jest.fn() },
      },
    };
    clients = { gmail: jest.fn(() => gmailClient) };
    authService = { buildClient: jest.fn(() => ({ auth: 'fake-oauth-client' })) };
    trigger = new GmailNewEmailReceivedTrigger(authService as never, clients as never);
  });

  const makeCtx = (cursor: string | null, config: Record<string, unknown> = {}) =>
    ({
      workflowId: 'wf-1',
      nodeId: 'trigger-1',
      cursor,
      config: { ...config },
      connection: {
        id: 'conn-1',
        type: 'OAUTH2',
        provider: 'google',
        config: {
          accessToken: 'tok',
          refreshToken: 'rtok',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
          tokenType: 'Bearer',
        },
        refreshToken: 'rtok',
      },
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }) as never;

  const messageDetail = ({ id }: { id: string }) =>
    Promise.resolve({
      data: {
        id,
        threadId: `thr-${id}`,
        labelIds: ['INBOX'],
        snippet: `body of ${id}`,
        payload: { headers: [{ name: 'Subject', value: `Subject ${id}` }] },
      },
    });

  it('exposes a 60-second default interval', () => {
    expect(trigger.defaultIntervalSeconds).toBe(60);
  });

  it('seeds the cursor on the first run without emitting historical messages', async () => {
    gmailClient.users.getProfile.mockResolvedValue({ data: { historyId: '900' } });

    const result = await trigger.poll(makeCtx(null));

    expect(gmailClient.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
    expect(gmailClient.users.history.list).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('900');
  });

  it('emits one item per newly-added message and advances the cursor', async () => {
    gmailClient.users.history.list.mockResolvedValue({
      data: {
        historyId: '1100',
        history: [
          { id: '1050', messagesAdded: [{ message: { id: 'msg-A', threadId: 'thr-A' } }] },
          {
            id: '1080',
            messagesAdded: [
              { message: { id: 'msg-B', threadId: 'thr-B' } },
              // duplicate id across records must not double-emit
              { message: { id: 'msg-A', threadId: 'thr-A' } },
            ],
          },
        ],
      },
    });
    gmailClient.users.messages.get.mockImplementation(messageDetail);

    const result = await trigger.poll(makeCtx('1000'));

    expect(gmailClient.users.history.list).toHaveBeenCalledWith({
      userId: 'me',
      startHistoryId: '1000',
      historyTypes: ['messageAdded'],
    });
    expect(result.items.map((i) => (i as { id: string }).id)).toEqual(['msg-A', 'msg-B']);
    expect(gmailClient.users.messages.list).not.toHaveBeenCalled();
    expect(result.newCursor).toBe('1100');
  });

  it('filters new messages by the optional Gmail query', async () => {
    gmailClient.users.history.list.mockResolvedValue({
      data: {
        historyId: '1200',
        history: [
          {
            id: '1150',
            messagesAdded: [{ message: { id: 'msg-A' } }, { message: { id: 'msg-B' } }],
          },
        ],
      },
    });
    // Only msg-B matches the query.
    gmailClient.users.messages.list.mockResolvedValue({ data: { messages: [{ id: 'msg-B' }] } });
    gmailClient.users.messages.get.mockImplementation(messageDetail);

    const result = await trigger.poll(makeCtx('1000', { query: 'from:boss@example.com' }));

    expect(gmailClient.users.messages.list).toHaveBeenCalledWith({
      userId: 'me',
      q: 'from:boss@example.com',
    });
    expect(result.items.map((i) => (i as { id: string }).id)).toEqual(['msg-B']);
  });

  it('keeps the cursor steady (no advance, no items) when history is empty', async () => {
    gmailClient.users.history.list.mockResolvedValue({
      data: { historyId: '1000', history: [] },
    });

    const result = await trigger.poll(makeCtx('1000'));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('1000');
  });

  it('throws ConnectionAuthError on 401', async () => {
    const err = Object.assign(new Error('Token expired'), { response: { status: 401 } });
    gmailClient.users.history.list.mockRejectedValue(err);

    await expect(trigger.poll(makeCtx('1000'))).rejects.toBeInstanceOf(ConnectionAuthError);
  });
});
