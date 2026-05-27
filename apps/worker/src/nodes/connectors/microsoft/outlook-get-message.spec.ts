import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { OutlookGetMessageAction } from './outlook-get-message';
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
  config: { accessToken: 'at', refreshToken: 'rt', scope: 'Mail.Read', tokenType: 'Bearer' },
  refreshToken: 'rt',
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, messageId: 'AAMk-msg-1', ...overrides },
});

const fullMessage = {
  id: 'AAMk-msg-1',
  subject: 'Quarterly report',
  from: { emailAddress: { name: 'Sender', address: 'sender@example.com' } },
  toRecipients: [{ emailAddress: { address: 'me@example.com' } }],
  ccRecipients: [{ emailAddress: { address: 'cc@example.com' } }],
  receivedDateTime: '2026-05-26T10:00:00Z',
  bodyPreview: 'Please review',
  body: { contentType: 'html', content: '<p>Please review</p>' },
  hasAttachments: true,
  attachments: [
    {
      id: 'att-1',
      name: 'report.pdf',
      contentType: 'application/pdf',
      size: 2048,
      isInline: false,
    },
  ],
};

describe('OutlookGetMessageAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: OutlookGetMessageAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new OutlookGetMessageAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('outlook-get-message');
    expect(action.requiredConnectionType).toBe('microsoft');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('GETs the message with attachment expand and parses headers/body/attachments', async () => {
      graphFetch.mockResolvedValue({ status: 200, data: fullMessage } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput(), ctx);

      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [, path] = graphFetch.mock.calls[0];
      expect(path).toContain('/v1.0/me/messages/AAMk-msg-1');
      expect(path).toContain('%24expand=');

      expect(result.data).toMatchObject({
        messageId: 'AAMk-msg-1',
        subject: 'Quarterly report',
        from: 'sender@example.com',
        to: ['me@example.com'],
        cc: ['cc@example.com'],
        receivedDateTime: '2026-05-26T10:00:00Z',
        bodyPreview: 'Please review',
        body: { contentType: 'html', content: '<p>Please review</p>' },
        hasAttachments: true,
      });
      expect(result.data.attachments).toEqual([
        {
          id: 'att-1',
          name: 'report.pdf',
          contentType: 'application/pdf',
          size: 2048,
          isInline: false,
        },
      ]);
    });

    it('encodes message IDs that contain URL-unsafe characters into the path', async () => {
      graphFetch.mockResolvedValue({ status: 200, data: { id: 'x' } } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ messageId: 'a/b+c=' }), ctx);
      const [, path] = graphFetch.mock.calls[0];
      expect(path).toContain('/v1.0/me/messages/a%2Fb%2Bc%3D');
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks connection for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(401, { error: { code: 'Unauthorized' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 (permission denied)', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(403, { error: { code: 'Forbidden' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(404, { error: { message: 'not found' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GraphHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects missing messageId before Graph is called', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ messageId: undefined }), ctx)).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call graphFetch when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(graphFetch).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
