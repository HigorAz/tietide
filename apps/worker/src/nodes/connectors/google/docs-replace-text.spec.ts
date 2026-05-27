import { ConnectionAuthError } from '@tietide/sdk';
import { DocsReplaceTextAction } from './docs-replace-text';
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

interface BatchArg {
  documentId: string;
  requestBody: {
    requests: {
      replaceAllText?: {
        containsText?: { text?: string; matchCase?: boolean };
        replaceText?: string;
      };
    }[];
  };
}

describe('DocsReplaceTextAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let batchUpdate: jest.Mock;
  let action: DocsReplaceTextAction;

  beforeEach(() => {
    auth = makeAuthService();
    batchUpdate = jest.fn();
    action = new DocsReplaceTextAction(
      auth as unknown as GoogleAuthService,
      makeClients({ docs: { documents: { batchUpdate } } }),
    );
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('docs-replace-text');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('maps each token to its occurrencesChanged; a missing token is a no-op', async () => {
      batchUpdate.mockResolvedValue({
        status: 200,
        data: {
          documentId: 'doc-1',
          replies: [{ replaceAllText: { occurrencesChanged: 2 } }, { replaceAllText: {} }],
        },
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(
        makeInput({
          documentId: 'doc-1',
          replacements: { '{{name}}': 'Alice', '{{missing}}': 'X' },
        }),
        ctx,
      );

      const arg = batchUpdate.mock.calls[0][0] as BatchArg;
      expect(arg.requestBody.requests).toHaveLength(2);
      expect(arg.requestBody.requests[0].replaceAllText?.containsText?.text).toBe('{{name}}');
      expect(arg.requestBody.requests[0].replaceAllText?.replaceText).toBe('Alice');
      expect(result.data.replacements).toEqual({ '{{name}}': 2, '{{missing}}': 0 });
    });

    it('passes matchCase through and defaults it to false', async () => {
      batchUpdate.mockResolvedValue({
        status: 200,
        data: { documentId: 'd', replies: [{ replaceAllText: { occurrencesChanged: 1 } }] },
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ documentId: 'd', replacements: { foo: 'bar' } }), ctx);
      const arg = batchUpdate.mock.calls[0][0] as BatchArg;
      expect(arg.requestBody.requests[0].replaceAllText?.containsText?.matchCase).toBe(false);
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      batchUpdate.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ documentId: 'd', replacements: { a: 'b' } }), ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      batchUpdate.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ documentId: 'd', replacements: { a: 'b' } }), ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      batchUpdate.mockRejectedValue(userError(404, 'Document not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ documentId: 'd', replacements: { a: 'b' } }), ctx),
      ).rejects.toThrow('Document not found');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects an empty replacements map before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ documentId: 'd', replacements: {} }), ctx),
      ).rejects.toThrow();
      expect(batchUpdate).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(
        makeInput({ documentId: 'd', replacements: { a: 'b' }, mockOnDryRun: true }),
        ctx,
      );
      expect(batchUpdate).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
