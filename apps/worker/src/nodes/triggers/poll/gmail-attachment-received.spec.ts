import { ConnectionAuthError } from '@tietide/sdk';
import { GmailAttachmentReceivedTrigger } from './gmail-attachment-received';

describe('GmailAttachmentReceivedTrigger', () => {
  let trigger: GmailAttachmentReceivedTrigger;
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
    trigger = new GmailAttachmentReceivedTrigger(authService as never, clients as never);
  });

  const makeCtx = (cursor: string | null, config: Record<string, unknown> = {}) =>
    ({
      workflowId: 'wf-1',
      nodeId: 'trigger-1',
      cursor,
      config: { connectionId: '00000000-0000-0000-0000-000000000001', ...config },
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

  const messageWithAttachment = (id: string) => ({
    data: {
      id,
      threadId: `thread-${id}`,
      labelIds: ['INBOX'],
      snippet: 'See attached',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Invoice' },
          { name: 'Date', value: 'Tue, 26 May 2026 10:00:00 +0000' },
        ],
        parts: [
          { mimeType: 'text/plain', filename: '', body: { size: 12 } },
          {
            mimeType: 'application/pdf',
            filename: 'invoice.pdf',
            body: { attachmentId: 'att-1', size: 2048 },
          },
        ],
      },
    },
  });

  it('exposes a 1-minute default interval', () => {
    expect(trigger.defaultIntervalSeconds).toBe(60);
  });

  it('seeds the cursor from getProfile on the first run without emitting', async () => {
    gmailClient.users.getProfile.mockResolvedValue({ data: { historyId: '5000' } });

    const result = await trigger.poll(makeCtx(null));

    expect(gmailClient.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
    expect(gmailClient.users.history.list).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('5000');
  });

  it('emits one item per new message that carries an attachment, with headers + attachments', async () => {
    gmailClient.users.history.list.mockResolvedValue({
      data: {
        historyId: '5100',
        history: [{ messagesAdded: [{ message: { id: 'm-1', threadId: 'thread-m-1' } }] }],
      },
    });
    gmailClient.users.messages.get.mockResolvedValue(messageWithAttachment('m-1'));

    const result = await trigger.poll(makeCtx('5000'));

    expect(gmailClient.users.history.list).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        startHistoryId: '5000',
        historyTypes: ['messageAdded'],
      }),
    );
    expect(gmailClient.users.messages.get).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', id: 'm-1', format: 'full' }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'm-1',
      threadId: 'thread-m-1',
      labelIds: ['INBOX'],
      headers: { From: 'sender@example.com', Subject: 'Invoice' },
      attachments: [
        { attachmentId: 'att-1', filename: 'invoice.pdf', mimeType: 'application/pdf', size: 2048 },
      ],
    });
    expect(result.newCursor).toBe('5100');
  });

  it('skips new messages that have no attachment', async () => {
    gmailClient.users.history.list.mockResolvedValue({
      data: {
        historyId: '5100',
        history: [{ messagesAdded: [{ message: { id: 'm-noatt' } }] }],
      },
    });
    gmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'm-noatt',
        threadId: 'thread',
        labelIds: ['INBOX'],
        snippet: 'plain text',
        payload: {
          mimeType: 'text/plain',
          headers: [{ name: 'Subject', value: 'No files' }],
          body: { size: 20 },
        },
      },
    });

    const result = await trigger.poll(makeCtx('5000'));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('5100');
  });

  it('detects attachments nested inside multipart parts', async () => {
    gmailClient.users.history.list.mockResolvedValue({
      data: {
        historyId: '5100',
        history: [{ messagesAdded: [{ message: { id: 'm-nested' } }] }],
      },
    });
    gmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'm-nested',
        threadId: 'thread',
        labelIds: ['INBOX'],
        snippet: 'nested',
        payload: {
          mimeType: 'multipart/mixed',
          headers: [{ name: 'Subject', value: 'Nested' }],
          parts: [
            {
              mimeType: 'multipart/alternative',
              filename: '',
              parts: [
                {
                  mimeType: 'image/png',
                  filename: 'photo.png',
                  body: { attachmentId: 'att-nested', size: 999 },
                },
              ],
            },
          ],
        },
      },
    });

    const result = await trigger.poll(makeCtx('5000'));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      attachments: [
        { attachmentId: 'att-nested', filename: 'photo.png', mimeType: 'image/png', size: 999 },
      ],
    });
  });

  it('keeps the cursor unchanged when the history response carries no new historyId', async () => {
    gmailClient.users.history.list.mockResolvedValue({ data: { history: [] } });

    const result = await trigger.poll(makeCtx('5000'));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('5000');
  });

  it('throws ConnectionAuthError on 401', async () => {
    const err = Object.assign(new Error('Token expired'), { response: { status: 401 } });
    gmailClient.users.history.list.mockRejectedValue(err);

    await expect(trigger.poll(makeCtx('5000'))).rejects.toBeInstanceOf(ConnectionAuthError);
  });

  it('throws ConnectionAuthError on 403', async () => {
    const err = Object.assign(new Error('Insufficient scope'), { response: { status: 403 } });
    gmailClient.users.history.list.mockRejectedValue(err);

    await expect(trigger.poll(makeCtx('5000'))).rejects.toBeInstanceOf(ConnectionAuthError);
  });

  it('rethrows non-auth errors as-is', async () => {
    const err = Object.assign(new Error('boom'), { response: { status: 500 } });
    gmailClient.users.history.list.mockRejectedValue(err);

    await expect(trigger.poll(makeCtx('5000'))).rejects.toThrow('boom');
  });
});
