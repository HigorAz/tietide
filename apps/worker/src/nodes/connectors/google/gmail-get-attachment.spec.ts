import { ConnectionAuthError } from '@tietide/sdk';
import { GmailGetAttachmentAction } from './gmail-get-attachment';
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

describe('GmailGetAttachmentAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let get: jest.Mock;
  let action: GmailGetAttachmentAction;

  beforeEach(() => {
    auth = makeAuthService();
    get = jest.fn();
    action = new GmailGetAttachmentAction(
      auth as unknown as GoogleAuthService,
      makeClients({ gmail: { users: { messages: { attachments: { get } } } } }),
    );
  });

  const baseParams = { messageId: 'msg-1', attachmentId: 'att-long-id' };

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('gmail-get-attachment');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('converts base64url data to standard base64 and echoes filename/mimeType', async () => {
      // bytes 0xFB 0xFF -> standard base64 "+/8=" -> base64url "-_8"
      get.mockResolvedValue({ status: 200, data: { data: '-_8', size: 2 } });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(
        makeInput({ ...baseParams, filename: 'doc.pdf', mimeType: 'application/pdf' }),
        ctx,
      );

      expect(get.mock.calls[0][0]).toMatchObject({
        userId: 'me',
        messageId: 'msg-1',
        id: 'att-long-id',
      });
      expect(result.data).toMatchObject({
        dataBase64: '+/8=',
        size: 2,
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
      });
    });

    it('returns null filename/mimeType when not provided', async () => {
      get.mockResolvedValue({ status: 200, data: { data: 'aGVsbG8', size: 5 } });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(baseParams), ctx);
      expect(result.data.filename).toBeNull();
      expect(result.data.mimeType).toBeNull();
      // base64url "aGVsbG8" decodes to "hello"
      expect(Buffer.from(result.data.dataBase64 as string, 'base64').toString('utf8')).toBe(
        'hello',
      );
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      get.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      get.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      get.mockRejectedValue(userError(404, 'Attachment not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow(
        'Attachment not found',
      );
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects missing attachmentId before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ messageId: 'msg-1' }), ctx)).rejects.toThrow();
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
      expect(get).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
