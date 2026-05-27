import { ConnectionAuthError } from '@tietide/sdk';
import { DocsInsertTextAction } from './docs-insert-text';
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
      insertText?: { text?: string; location?: { index?: number }; endOfSegmentLocation?: object };
    }[];
  };
}

describe('DocsInsertTextAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let batchUpdate: jest.Mock;
  let action: DocsInsertTextAction;

  beforeEach(() => {
    auth = makeAuthService();
    batchUpdate = jest.fn().mockResolvedValue({ status: 200, data: { documentId: 'doc-1' } });
    action = new DocsInsertTextAction(
      auth as unknown as GoogleAuthService,
      makeClients({ docs: { documents: { batchUpdate } } }),
    );
  });

  const baseParams = { documentId: 'doc-1', text: 'Hello' };

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('docs-insert-text');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('inserts at a specific index when index is provided', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ ...baseParams, index: 12 }), ctx);

      const arg = batchUpdate.mock.calls[0][0] as BatchArg;
      const req = arg.requestBody.requests[0];
      expect(req.insertText?.text).toBe('Hello');
      expect(req.insertText?.location?.index).toBe(12);
      expect(req.insertText?.endOfSegmentLocation).toBeUndefined();
      expect(result.data).toMatchObject({ documentId: 'doc-1', mode: 'at-index' });
    });

    it('appends at end of body when index is omitted', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(baseParams), ctx);

      const arg = batchUpdate.mock.calls[0][0] as BatchArg;
      const req = arg.requestBody.requests[0];
      expect(req.insertText?.endOfSegmentLocation).toBeDefined();
      expect(req.insertText?.location).toBeUndefined();
      expect(result.data).toMatchObject({ mode: 'append' });
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      batchUpdate.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      batchUpdate.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      batchUpdate.mockRejectedValue(userError(400, 'Invalid index'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow('Invalid index');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects empty text before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ documentId: 'doc-1', text: '' }), ctx),
      ).rejects.toThrow();
      expect(batchUpdate).not.toHaveBeenCalled();
    });

    it('rejects index 0 (document start is not insertable)', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ ...baseParams, index: 0 }), ctx)).rejects.toThrow();
      expect(batchUpdate).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
      expect(batchUpdate).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
