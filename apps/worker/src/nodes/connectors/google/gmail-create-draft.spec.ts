import { ConnectionAuthError } from '@tietide/sdk';
import { GmailCreateDraftAction } from './gmail-create-draft';
import type { GoogleAuthService } from './google-auth';
import {
  VALID_CONNECTION_ID,
  authError,
  makeAuthService,
  makeClients,
  makeConnection,
  makeContext,
  makeInput,
  userError,
} from './__test__/fixtures';

jest.setTimeout(15000);

interface CreateArg {
  userId: string;
  requestBody: { message: { raw: string; threadId?: string } };
}

const decodeRaw = (raw: string): string =>
  Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

describe('GmailCreateDraftAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let create: jest.Mock;
  let action: GmailCreateDraftAction;

  beforeEach(() => {
    auth = makeAuthService();
    create = jest.fn().mockResolvedValue({
      status: 200,
      data: { id: 'draft-1', message: { id: 'msg-9', threadId: 'th-9' } },
    });
    action = new GmailCreateDraftAction(
      auth as unknown as GoogleAuthService,
      makeClients({ gmail: { users: { drafts: { create } } } }),
    );
  });

  const baseParams = { to: 'r@example.com', subject: 'Hello', body: 'Hi there.' };

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('gmail-create-draft');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('creates a draft from an RFC 822 message and returns ids', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(baseParams), ctx);

      const arg = create.mock.calls[0][0] as CreateArg;
      expect(arg.userId).toBe('me');
      const decoded = decodeRaw(arg.requestBody.message.raw);
      expect(decoded).toContain('To: r@example.com');
      expect(decoded).toContain('Subject: Hello');
      expect(decoded).toContain('Hi there.');
      expect(arg.requestBody.message.threadId).toBeUndefined();

      expect(result.data).toMatchObject({
        draftId: 'draft-1',
        messageId: 'msg-9',
        threadId: 'th-9',
      });
    });

    it('threads the draft as a reply when threadId is provided', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ ...baseParams, threadId: 'th-existing' }), ctx);
      const arg = create.mock.calls[0][0] as CreateArg;
      expect(arg.requestBody.message.threadId).toBe('th-existing');
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      create.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      create.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      create.mockRejectedValue(userError(400, 'Bad request'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow('Bad request');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a To header containing CRLF before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ ...baseParams, to: 'r@e.com\r\nBcc: evil@e.com' }), ctx),
      ).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects when body is missing', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ to: 'r@e.com', subject: 'S' }), ctx),
      ).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
      expect(create).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
