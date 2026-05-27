import { ConnectionAuthError } from '@tietide/sdk';
import { DocsGetAction } from './docs-get';
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

const doc = {
  title: 'Quarterly Report',
  body: {
    content: [
      { paragraph: { elements: [{ textRun: { content: 'Hello world.\n' } }] } },
      {
        paragraph: {
          elements: [{ textRun: { content: 'Second ' } }, { textRun: { content: 'line.\n' } }],
        },
      },
      { sectionBreak: {} },
    ],
  },
};

describe('DocsGetAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let get: jest.Mock;
  let action: DocsGetAction;

  beforeEach(() => {
    auth = makeAuthService();
    get = jest.fn().mockResolvedValue({ status: 200, data: doc });
    action = new DocsGetAction(
      auth as unknown as GoogleAuthService,
      makeClients({ docs: { documents: { get } } }),
    );
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('docs-get');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('returns title, concatenated plain text, and raw content', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ documentId: 'doc-1' }), ctx);

      expect(get.mock.calls[0][0]).toMatchObject({ documentId: 'doc-1' });
      expect(result.data.title).toBe('Quarterly Report');
      expect(result.data.plainText).toBe('Hello world.\nSecond line.\n');
      expect(Array.isArray(result.data.content)).toBe(true);
      expect((result.data.content as unknown[]).length).toBe(3);
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      get.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ documentId: 'd' }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      get.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ documentId: 'd' }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      get.mockRejectedValue(userError(404, 'Document not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ documentId: 'd' }), ctx)).rejects.toThrow(
        'Document not found',
      );
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a missing documentId before the SDK is touched', async () => {
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
      const result = await action.execute(makeInput({ documentId: 'd', mockOnDryRun: true }), ctx);
      expect(get).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
