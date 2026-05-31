import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { OutlookCreateDraftAction } from './outlook-create-draft';
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
  params: {
    connectionId: VALID_CONNECTION_ID,
    to: 'recipient@example.com',
    subject: 'Hello',
    body: 'Greetings.',
    ...overrides,
  },
});

const draftResp = { status: 201, data: { id: 'draft-1', webLink: 'https://outlook/draft-1' } };

describe('OutlookCreateDraftAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: OutlookCreateDraftAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new OutlookCreateDraftAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('outlook-create-draft');
    expect(action.requiredConnectionType).toBe('microsoft');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('POSTs a standalone draft to /me/messages with the message envelope', async () => {
      graphFetch.mockResolvedValue(draftResp as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput({ cc: 'c@e.com' }), ctx);

      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [, path, init] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/messages');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string) as {
        subject: string;
        body: { contentType: string; content: string };
        toRecipients: Array<{ emailAddress: { address: string } }>;
        ccRecipients: Array<{ emailAddress: { address: string } }>;
      };
      expect(body.subject).toBe('Hello');
      expect(body.body).toEqual({ contentType: 'Text', content: 'Greetings.' });
      expect(body.toRecipients).toEqual([{ emailAddress: { address: 'recipient@example.com' } }]);
      expect(body.ccRecipients).toEqual([{ emailAddress: { address: 'c@e.com' } }]);
      expect(result.data).toMatchObject({
        draftId: 'draft-1',
        webLink: 'https://outlook/draft-1',
        isReply: false,
      });
    });

    it('uses an HTML body when isHtml=true', async () => {
      graphFetch.mockResolvedValue(draftResp as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ body: '<p>Hi</p>', isHtml: true }), ctx);
      const [, , init] = graphFetch.mock.calls[0];
      const body = JSON.parse(init.body as string) as { body: { contentType: string } };
      expect(body.body.contentType).toBe('HTML');
    });

    it('creates a reply draft via createReply with the body as the comment', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'reply-draft', webLink: 'https://outlook/reply' },
      } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(
        makeInput({ replyToMessageId: 'orig-msg', to: undefined, subject: undefined }),
        ctx,
      );

      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [, path, init] = graphFetch.mock.calls[0];
      expect(path).toBe('/v1.0/me/messages/orig-msg/createReply');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ comment: 'Greetings.' });
      expect(result.data).toMatchObject({ draftId: 'reply-draft', isReply: true });
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks connection for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(401, { error: { code: 'Unauthorized' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 (insufficient scope)', async () => {
      graphFetch.mockRejectedValue(
        new GraphHttpError(403, { error: { code: 'ErrorAccessDenied' } }),
      );
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(400, { error: { message: 'bad' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GraphHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a standalone draft missing to/subject before Graph is called', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ to: undefined, subject: undefined }), ctx),
      ).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });

    it('rejects an empty body before Graph is called', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ body: '' }), ctx)).rejects.toThrow();
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
      expect(result.data).toMatchObject({ dryRun: true, skipped: true });
    });
  });
});
