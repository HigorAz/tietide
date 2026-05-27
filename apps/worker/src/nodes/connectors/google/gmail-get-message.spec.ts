import { ConnectionAuthError } from '@tietide/sdk';
import { GmailGetMessageAction } from './gmail-get-message';
import type { GoogleAuthService } from './google-auth';
import {
  VALID_CONNECTION_ID,
  authError,
  makeAuthService,
  makeClients,
  makeContext,
  makeConnection,
  makeInput,
  userError,
} from './__test__/fixtures';

jest.setTimeout(15000);

const b64url = (s: string): string =>
  Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fullMessage = {
  id: 'msg-1',
  threadId: 'th-1',
  labelIds: ['INBOX', 'UNREAD'],
  snippet: 'Hello there',
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: 'sender@example.com' },
      { name: 'To', value: 'me@example.com' },
      { name: 'Cc', value: 'cc@example.com' },
      { name: 'Subject', value: 'Test Subject' },
      { name: 'Date', value: 'Mon, 26 May 2026 10:00:00 +0000' },
    ],
    parts: [
      { mimeType: 'text/plain', body: { data: b64url('Plain body') } },
      { mimeType: 'text/html', body: { data: b64url('<p>HTML body</p>') } },
      {
        mimeType: 'application/pdf',
        filename: 'doc.pdf',
        body: { attachmentId: 'att-1', size: 1234 },
      },
    ],
  },
};

describe('GmailGetMessageAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let get: jest.Mock;
  let action: GmailGetMessageAction;

  beforeEach(() => {
    auth = makeAuthService();
    get = jest.fn();
    action = new GmailGetMessageAction(
      auth as unknown as GoogleAuthService,
      makeClients({ gmail: { users: { messages: { get } } } }),
    );
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('gmail-get-message');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('extracts headers, decodes base64url bodies, and lists attachments', async () => {
      get.mockResolvedValue({ status: 200, data: fullMessage });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput({ messageId: 'msg-1' }), ctx);

      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0][0]).toMatchObject({ userId: 'me', id: 'msg-1', format: 'full' });
      expect(result.data).toMatchObject({
        subject: 'Test Subject',
        from: 'sender@example.com',
        to: 'me@example.com',
        cc: 'cc@example.com',
        date: 'Mon, 26 May 2026 10:00:00 +0000',
        snippet: 'Hello there',
        bodyText: 'Plain body',
        bodyHtml: '<p>HTML body</p>',
        labelIds: ['INBOX', 'UNREAD'],
      });
      expect(result.data.attachments).toEqual([
        { filename: 'doc.pdf', attachmentId: 'att-1', mimeType: 'application/pdf', size: 1234 },
      ]);
    });

    it('decodes a single-part text/plain message (no parts array)', async () => {
      get.mockResolvedValue({
        status: 200,
        data: {
          id: 'm2',
          threadId: 't2',
          labelIds: ['INBOX'],
          snippet: 'snip',
          payload: {
            mimeType: 'text/plain',
            headers: [{ name: 'Subject', value: 'Plain' }],
            body: { data: b64url('Just text') },
          },
        },
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ messageId: 'm2' }), ctx);
      expect(result.data.bodyText).toBe('Just text');
      expect(result.data.bodyHtml).toBeNull();
      expect(result.data.attachments).toEqual([]);
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      get.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ messageId: 'm' }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      get.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ messageId: 'm' }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      get.mockRejectedValue(userError(404, 'Message not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ messageId: 'm' }), ctx)).rejects.toThrow(
        'Message not found',
      );
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects missing messageId before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toThrow();
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ messageId: 'm', mockOnDryRun: true }), ctx);
      expect(get).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
