import { ConnectionAuthError } from '@tietide/sdk';
import { GmailLabelAddedTrigger } from './gmail-label-added';

describe('GmailLabelAddedTrigger', () => {
  let trigger: GmailLabelAddedTrigger;
  let authService: { buildClient: jest.Mock };
  let clients: { gmail: jest.Mock };
  let gmailClient: {
    users: {
      getProfile: jest.Mock;
      history: { list: jest.Mock };
      messages: { get: jest.Mock };
    };
  };

  beforeEach(() => {
    gmailClient = {
      users: {
        getProfile: jest.fn(),
        history: { list: jest.fn() },
        messages: { get: jest.fn() },
      },
    };
    clients = { gmail: jest.fn(() => gmailClient) };
    authService = { buildClient: jest.fn(() => ({ auth: 'fake-oauth-client' })) };
    trigger = new GmailLabelAddedTrigger(authService as never, clients as never);
  });

  const makeCtx = (cursor: string | null, config: Record<string, unknown> = {}) =>
    ({
      workflowId: 'wf-1',
      nodeId: 'trigger-1',
      cursor,
      config: { labelId: 'INBOX', ...config },
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

  it('exposes a 60-second default interval', () => {
    expect(trigger.defaultIntervalSeconds).toBe(60);
  });

  it('seeds the cursor on the first run via users.getProfile without emitting historical messages', async () => {
    gmailClient.users.getProfile.mockResolvedValue({ data: { historyId: '900' } });

    const result = await trigger.poll(makeCtx(null));

    expect(gmailClient.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
    expect(gmailClient.users.history.list).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('900');
  });

  it('emits one item per matching labelAdded entry and advances the cursor', async () => {
    gmailClient.users.history.list.mockResolvedValue({
      data: {
        historyId: '1100',
        history: [
          {
            id: '1050',
            labelsAdded: [{ message: { id: 'msg-A', threadId: 'thr-A' }, labelIds: ['INBOX'] }],
          },
          {
            id: '1080',
            labelsAdded: [
              { message: { id: 'msg-B', threadId: 'thr-B' }, labelIds: ['INBOX', 'STARRED'] },
              { message: { id: 'msg-C', threadId: 'thr-C' }, labelIds: ['SPAM'] },
            ],
          },
        ],
      },
    });
    gmailClient.users.messages.get.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({
        data: {
          id,
          threadId: `thr-${id.slice(-1)}`,
          labelIds: ['INBOX'],
          snippet: `body of ${id}`,
          payload: { headers: [{ name: 'Subject', value: `Subject ${id}` }] },
        },
      }),
    );

    const result = await trigger.poll(makeCtx('1000'));

    expect(gmailClient.users.history.list).toHaveBeenCalledWith({
      userId: 'me',
      startHistoryId: '1000',
      historyTypes: ['labelAdded'],
      labelId: 'INBOX',
    });
    // Two messages had INBOX added; msg-C (SPAM only) is filtered out.
    expect(result.items).toHaveLength(2);
    const ids = result.items.map((i) => (i as { id: string }).id);
    expect(ids).toEqual(['msg-A', 'msg-B']);
    expect(result.newCursor).toBe('1100');
  });

  it('keeps cursor steady (no advance, no items) when history is empty', async () => {
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

  it('throws when labelId is missing', async () => {
    await expect(trigger.poll(makeCtx('1000', { labelId: '' }))).rejects.toThrow(/labelId/);
  });
});
