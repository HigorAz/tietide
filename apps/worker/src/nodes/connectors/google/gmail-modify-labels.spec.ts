import { ConnectionAuthError } from '@tietide/sdk';
import { GmailModifyLabelsAction } from './gmail-modify-labels';
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

interface ModifyArg {
  userId: string;
  id: string;
  requestBody: { addLabelIds?: string[]; removeLabelIds?: string[] };
}

describe('GmailModifyLabelsAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let modify: jest.Mock;
  let action: GmailModifyLabelsAction;

  beforeEach(() => {
    auth = makeAuthService();
    modify = jest.fn().mockResolvedValue({ status: 200, data: { id: 'msg-1', labelIds: ['X'] } });
    action = new GmailModifyLabelsAction(
      auth as unknown as GoogleAuthService,
      makeClients({ gmail: { users: { messages: { modify } } } }),
    );
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('gmail-modify-labels');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('passes explicit add/remove label IDs and returns the new labelIds', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ messageId: 'msg-1', addLabelIds: ['STARRED'], removeLabelIds: ['SPAM'] }),
        ctx,
      );
      const arg = modify.mock.calls[0][0] as ModifyArg;
      expect(arg).toMatchObject({ userId: 'me', id: 'msg-1' });
      expect(arg.requestBody.addLabelIds).toEqual(['STARRED']);
      expect(arg.requestBody.removeLabelIds).toEqual(['SPAM']);
      expect(result.data.labelIds).toEqual(['X']);
    });

    it('maps archive → remove INBOX, markRead → remove UNREAD', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ messageId: 'm', archive: true, markRead: true }), ctx);
      const arg = modify.mock.calls[0][0] as ModifyArg;
      expect(arg.requestBody.removeLabelIds).toEqual(expect.arrayContaining(['INBOX', 'UNREAD']));
      expect(arg.requestBody.addLabelIds).toEqual([]);
    });

    it('maps markUnread → add UNREAD', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ messageId: 'm', markUnread: true }), ctx);
      const arg = modify.mock.calls[0][0] as ModifyArg;
      expect(arg.requestBody.addLabelIds).toEqual(['UNREAD']);
    });

    it('dedupes a label given both explicitly and via a flag', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(
        makeInput({ messageId: 'm', removeLabelIds: ['INBOX'], archive: true }),
        ctx,
      );
      const arg = modify.mock.calls[0][0] as ModifyArg;
      expect(arg.requestBody.removeLabelIds).toEqual(['INBOX']);
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      modify.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ messageId: 'm', archive: true }), ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      modify.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ messageId: 'm', archive: true }), ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      modify.mockRejectedValue(userError(404, 'Message not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ messageId: 'm', archive: true }), ctx),
      ).rejects.toThrow('Message not found');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects when no label change is specified', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ messageId: 'm' }), ctx)).rejects.toThrow();
      expect(modify).not.toHaveBeenCalled();
    });

    it('rejects markRead + markUnread together', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ messageId: 'm', markRead: true, markUnread: true }), ctx),
      ).rejects.toThrow();
      expect(modify).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(
        makeInput({ messageId: 'm', archive: true, mockOnDryRun: true }),
        ctx,
      );
      expect(modify).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
