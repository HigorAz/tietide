import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { OutlookUpdateMessageAction } from './outlook-update-message';
import type { MicrosoftAuthService, GraphResponse } from './microsoft-auth';
import { GraphHttpError } from './microsoft-auth';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeAuthService = (
  graphFetch: jest.Mock = jest.fn(),
): jest.Mocked<Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>> => ({
  graphFetch,
  buildAuthHeader: jest.fn(),
  graphBaseUrl: jest.fn(),
});

const makeContext = (
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext & { markConnectionForRefresh: jest.Mock } => {
  const ctx = {
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return ctx as unknown as ExecutionContext & { markConnectionForRefresh: jest.Mock };
};

const makeConnection = (): DecryptedConnection<MicrosoftOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'microsoft',
  config: { accessToken: 'at', refreshToken: 'rt', scope: 'Mail.ReadWrite', tokenType: 'Bearer' },
  refreshToken: 'rt',
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, messageId: 'msg-1', ...overrides },
});

const okPatch = { status: 200, data: { id: 'msg-1' } } as GraphResponse;

describe('OutlookUpdateMessageAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: OutlookUpdateMessageAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new OutlookUpdateMessageAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('outlook-update-message');
    expect(action.requiredConnectionType).toBe('microsoft');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('PATCHes the flag (round-trip flagStatus) and reports it applied', async () => {
      graphFetch.mockResolvedValue(okPatch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput({ flagStatus: 'flagged' }), ctx);

      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [, path, init] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/messages/msg-1');
      expect(init.method).toBe('PATCH');
      const body = JSON.parse(init.body as string) as { flag: { flagStatus: string } };
      expect(body.flag).toEqual({ flagStatus: 'flagged' });
      expect(result.data.applied).toEqual({ flag: 'flagged' });
    });

    it('PATCHes categories and read state together', async () => {
      graphFetch.mockResolvedValue(okPatch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ categories: ['Red category'], markRead: true }), ctx);
      const [, , init] = graphFetch.mock.calls[0];
      const body = JSON.parse(init.body as string) as { categories: string[]; isRead: boolean };
      expect(body.categories).toEqual(['Red category']);
      expect(body.isRead).toBe(true);
    });

    it('moves the message and returns the new id from the move response', async () => {
      graphFetch
        .mockResolvedValueOnce(okPatch) // PATCH isRead
        .mockResolvedValueOnce({ status: 201, data: { id: 'msg-moved' } } as GraphResponse); // move
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(
        makeInput({ markUnread: true, moveToFolderId: 'archive' }),
        ctx,
      );

      expect(graphFetch).toHaveBeenCalledTimes(2);
      const [, movePath, moveInit] = graphFetch.mock.calls[1];
      expect(movePath).toBe('/v1.0/me/messages/msg-1/move');
      expect(moveInit.method).toBe('POST');
      expect(JSON.parse(moveInit.body as string)).toEqual({ destinationId: 'archive' });
      expect(result.data.messageId).toBe('msg-moved');
      expect(result.data.applied).toMatchObject({ isRead: false, movedTo: 'archive' });
    });

    it('moves without a PATCH when only moveToFolderId is set', async () => {
      graphFetch.mockResolvedValue({ status: 201, data: { id: 'msg-moved' } } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ moveToFolderId: 'deleteditems' }), ctx);
      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [, path] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/messages/msg-1/move');
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks connection for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(401, { error: { code: 'Unauthorized' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ flagStatus: 'flagged' }), ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 (insufficient scope)', async () => {
      graphFetch.mockRejectedValue(
        new GraphHttpError(403, { error: { code: 'ErrorAccessDenied' } }),
      );
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ flagStatus: 'flagged' }), ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(404, { error: { message: 'not found' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ markRead: true }), ctx)).rejects.toBeInstanceOf(
        GraphHttpError,
      );
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects markRead + markUnread together before Graph is called', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ markRead: true, markUnread: true }), ctx),
      ).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });

    it('rejects an update with no operations specified', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call graphFetch when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(
        makeInput({ flagStatus: 'flagged', mockOnDryRun: true }),
        ctx,
      );
      expect(graphFetch).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.data).toMatchObject({ dryRun: true, skipped: true });
    });
  });
});
