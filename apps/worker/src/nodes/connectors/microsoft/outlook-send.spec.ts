import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { OutlookSendAction } from './outlook-send';
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
  config: {
    accessToken: 'at',
    refreshToken: 'rt',
    scope: 'Mail.Send',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt',
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    to: 'recipient@example.com',
    subject: 'Hello',
    body: 'Greetings.',
    ...overrides,
  },
});

describe('OutlookSendAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: OutlookSendAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new OutlookSendAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('outlook-send');
    expect(action.requiredConnectionType).toBe('microsoft');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('POSTs to /v1.0/me/sendMail with the message envelope and returns sent metadata', async () => {
      graphFetch.mockResolvedValue({ status: 202, data: null } as GraphResponse);

      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput(), ctx);

      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [conn, path, init] = graphFetch.mock.calls[0];
      expect(conn.id).toBe(VALID_CONNECTION_ID);
      expect(path).toBe('/v1.0/me/sendMail');
      expect(init.method).toBe('POST');

      const payload = JSON.parse(init.body as string) as {
        message: {
          subject: string;
          body: { contentType: string; content: string };
          toRecipients: Array<{ emailAddress: { address: string } }>;
        };
      };
      expect(payload.message.subject).toBe('Hello');
      expect(payload.message.body).toEqual({ contentType: 'Text', content: 'Greetings.' });
      expect(payload.message.toRecipients).toEqual([
        { emailAddress: { address: 'recipient@example.com' } },
      ]);

      expect(result.data.sent).toBe(true);
      expect(typeof result.data.sentAt).toBe('string');
    });

    it('parses comma-separated cc/bcc into recipient arrays', async () => {
      graphFetch.mockResolvedValue({ status: 202, data: null } as GraphResponse);
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await action.execute(
        makeInput({
          cc: 'a@e.com, b@e.com',
          bcc: 'c@e.com',
        }),
        ctx,
      );
      const [, , init] = graphFetch.mock.calls[0];
      const payload = JSON.parse(init.body as string) as {
        message: {
          ccRecipients: Array<{ emailAddress: { address: string } }>;
          bccRecipients: Array<{ emailAddress: { address: string } }>;
        };
      };
      expect(payload.message.ccRecipients).toEqual([
        { emailAddress: { address: 'a@e.com' } },
        { emailAddress: { address: 'b@e.com' } },
      ]);
      expect(payload.message.bccRecipients).toEqual([{ emailAddress: { address: 'c@e.com' } }]);
    });

    it('uses HTML body when isHtml=true', async () => {
      graphFetch.mockResolvedValue({ status: 202, data: null } as GraphResponse);
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await action.execute(makeInput({ body: '<p>Hi</p>', isHtml: true }), ctx);
      const [, , init] = graphFetch.mock.calls[0];
      const payload = JSON.parse(init.body as string) as {
        message: { body: { contentType: string; content: string } };
      };
      expect(payload.message.body).toEqual({ contentType: 'HTML', content: '<p>Hi</p>' });
    });

    it('attaches fileAttachment items with @odata.type when attachments are present', async () => {
      graphFetch.mockResolvedValue({ status: 202, data: null } as GraphResponse);
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await action.execute(
        makeInput({
          attachments: [{ filename: 'a.txt', contentBase64: 'aGVsbG8=', mimeType: 'text/plain' }],
        }),
        ctx,
      );
      const [, , init] = graphFetch.mock.calls[0];
      const payload = JSON.parse(init.body as string) as {
        message: {
          attachments: Array<Record<string, string>>;
        };
      };
      expect(payload.message.attachments).toEqual([
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: 'a.txt',
          contentType: 'text/plain',
          contentBytes: 'aGVsbG8=',
        },
      ]);
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks connection for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(401, { error: { code: 'Unauthorized' } }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 (permission denied)', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(403, { error: { code: 'Forbidden' } }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(400, { error: { message: 'bad' } }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GraphHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
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

  describe('schema rejection (header injection)', () => {
    it('rejects To with CRLF before Graph is called', async () => {
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await expect(
        action.execute(makeInput({ to: 'recipient@example.com\r\nBcc: evil@e.com' }), ctx),
      ).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });

    it('rejects Subject with CRLF before Graph is called', async () => {
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await expect(
        action.execute(makeInput({ subject: 'Hi\r\nBcc: evil@e.com' }), ctx),
      ).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });
  });
});
