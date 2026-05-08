import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import { GmailSendAction, encodeRfc822 } from './gmail-send';
import type { GoogleAuthService, GoogleClientFactories } from './google-auth';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

interface SendArg {
  userId: string;
  requestBody: { raw: string };
}

const decodeRaw = (raw: string): string => {
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
};

const makeAuthService = (): jest.Mocked<Pick<GoogleAuthService, 'buildClient'>> => ({
  buildClient: jest.fn().mockReturnValue({} as never),
});

const makeClients = (send: jest.Mock): GoogleClientFactories => ({
  gmail: () => ({ users: { messages: { send } } }) as never,
  drive: () => ({}) as never,
  sheets: () => ({}) as never,
  docs: () => ({}) as never,
  calendar: () => ({}) as never,
});

const makeContext = (
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext & {
  markConnectionForRefresh: jest.Mock;
} => {
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

const makeConnection = (
  overrides: Partial<DecryptedConnection<GoogleOAuth2Config>> = {},
): DecryptedConnection<GoogleOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'google',
  config: {
    accessToken: 'at',
    refreshToken: 'rt',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt',
  ...overrides,
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

describe('GmailSendAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let send: jest.Mock;
  let action: GmailSendAction;

  beforeEach(() => {
    auth = makeAuthService();
    send = jest.fn();
    action = new GmailSendAction(auth as unknown as GoogleAuthService, makeClients(send));
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('gmail-send');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('sends a base64url-encoded RFC 822 message and returns ids', async () => {
      send.mockResolvedValue({
        status: 200,
        data: { id: 'msg-1', threadId: 'th-1', labelIds: ['SENT'] },
      });

      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput(), ctx);

      expect(send).toHaveBeenCalledTimes(1);
      const arg = send.mock.calls[0][0] as SendArg;
      expect(arg.userId).toBe('me');
      const decoded = decodeRaw(arg.requestBody.raw);
      expect(decoded).toContain('To: recipient@example.com');
      expect(decoded).toContain('Subject: Hello');
      expect(decoded).toContain('Greetings.');

      expect(result.data).toEqual({
        messageId: 'msg-1',
        threadId: 'th-1',
        labelIds: ['SENT'],
      });
    });

    it('includes Cc and Bcc headers when provided', async () => {
      send.mockResolvedValue({ status: 200, data: { id: 'm', threadId: 't' } });
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await action.execute(makeInput({ cc: 'cc@example.com', bcc: 'bcc@example.com' }), ctx);
      const arg = send.mock.calls[0][0] as SendArg;
      const decoded = decodeRaw(arg.requestBody.raw);
      expect(decoded).toContain('Cc: cc@example.com');
      expect(decoded).toContain('Bcc: bcc@example.com');
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 (GaxiosError shape) and marks for refresh', async () => {
      const authErr = Object.assign(new Error('Unauthorized'), {
        response: { status: 401, data: { error: { message: 'Invalid Credentials' } } },
      });
      send.mockRejectedValue(authErr);

      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });

      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      const userErr = Object.assign(new Error('Bad recipient'), {
        response: { status: 400, data: { error: { message: 'Invalid To: address' } } },
      });
      send.mockRejectedValue(userErr);

      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });

      await expect(action.execute(makeInput(), ctx)).rejects.toThrow('Bad recipient');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true, attachments: [] }), ctx);

      expect(send).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });

    it('still calls the SDK when isDryRun is true but mockOnDryRun is false', async () => {
      send.mockResolvedValue({ status: 200, data: { id: 'm' } });
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await action.execute(makeInput(), ctx);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('schema rejection (header injection)', () => {
    it('rejects To with CRLF before the SDK is touched', async () => {
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await expect(
        action.execute(makeInput({ to: 'recipient@example.com\r\nBcc: evil@e.com' }), ctx),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it('rejects Subject with CRLF before the SDK is touched', async () => {
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      await expect(
        action.execute(makeInput({ subject: 'Hi\r\nBcc: evil@e.com' }), ctx),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('attachments', () => {
    it('encodes a multipart message when attachments are present', () => {
      const raw = encodeRfc822({
        to: 'r@e.com',
        subject: 'S',
        body: 'B',
        attachments: [{ filename: 'a.txt', contentBase64: 'aGVsbG8=', mimeType: 'text/plain' }],
      });
      const decoded = decodeRaw(raw);
      expect(decoded).toMatch(/Content-Type: multipart\/mixed; boundary="tietide_/);
      expect(decoded).toContain('Content-Disposition: attachment; filename="a.txt"');
      expect(decoded).toContain('aGVsbG8=');
    });
  });
});
