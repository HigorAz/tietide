import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { OutlookSearchAction } from './outlook-search';
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
  params: {
    connectionId: VALID_CONNECTION_ID,
    query: 'subject:invoice',
    ...overrides,
  },
});

describe('OutlookSearchAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: OutlookSearchAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new OutlookSearchAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('outlook-search');
    expect(action.requiredConnectionType).toBe('microsoft');
  });

  it('GETs /v1.0/me/messages with $search, $top and $select query params', async () => {
    graphFetch.mockResolvedValue({
      status: 200,
      data: {
        value: [
          {
            id: 'm1',
            subject: 'Invoice 42',
            from: { emailAddress: { address: 's@e.com', name: 'S' } },
            receivedDateTime: '2026-05-08T10:00:00Z',
            bodyPreview: 'preview',
          },
        ],
      },
    } as GraphResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

    const result = await action.execute(makeInput({ maxResults: 5 }), ctx);

    expect(graphFetch).toHaveBeenCalledTimes(1);
    const [, path, init] = graphFetch.mock.calls[0];
    expect(path).toMatch(/^\/v1\.0\/me\/messages\?/);
    expect(path).toContain('%24search=%22subject%3Ainvoice%22');
    expect(path).toContain('%24top=5');
    expect(path).toContain('%24select=');
    expect(init === undefined || (init as { method?: string }).method === undefined).toBe(true);

    expect(result.data.count).toBe(1);
    expect(Array.isArray(result.data.messages)).toBe(true);
    const messages = result.data.messages as Array<{ id: string; subject: string }>;
    expect(messages[0]).toEqual(expect.objectContaining({ id: 'm1', subject: 'Invoice 42' }));
  });

  it('defaults maxResults to 10 when omitted', async () => {
    graphFetch.mockResolvedValue({ status: 200, data: { value: [] } } as GraphResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(makeInput(), ctx);
    const [, path] = graphFetch.mock.calls[0];
    expect(path).toContain('%24top=10');
  });

  it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
    graphFetch.mockRejectedValue(new GraphHttpError(401, {}));
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    expect(ctx.markConnectionForRefresh).toHaveBeenCalled();
  });

  it('returns mocked data on dry-run + mockOnDryRun', async () => {
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(graphFetch).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });

  it('rejects empty query at the schema layer', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ query: '' }), ctx)).rejects.toThrow();
    expect(graphFetch).not.toHaveBeenCalled();
  });
});
