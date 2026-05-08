import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackUploadFileAction } from './slack-upload-file';
import type { SlackClientFactory, SlackResponse } from './slack-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

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

const makeConnection = (): DecryptedConnection<SlackOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'slack',
  config: {
    accessToken: 'xoxb-valid',
    teamId: 'T123',
    botUserId: 'U123',
    scope: 'files:write',
  },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    channel: 'C0123ABCDEF',
    filename: 'note.txt',
    contentBase64: Buffer.from('hello world').toString('base64'),
    ...overrides,
  },
});

describe('SlackUploadFileAction', () => {
  it('uploads a multipart payload to /files.upload', async () => {
    const call = jest.fn().mockResolvedValue({
      status: 200,
      data: { ok: true, file: { id: 'F123', permalink: 'https://slack/p' } },
    } as SlackResponse);
    const action = new SlackUploadFileAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as SlackClientFactory);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    expect(call).toHaveBeenCalledTimes(1);
    const [, path, init] = call.mock.calls[0];
    expect(path).toBe('/files.upload');
    expect(init.method).toBe('POST');
    expect(init.contentType).toBe('');
    // FormData body — the factory will let fetch set the multipart boundary.
    expect(init.body).toBeDefined();
    expect(typeof (init.body as FormData).append).toBe('function');

    expect(result.data).toEqual({
      ok: true,
      fileId: 'F123',
      permalink: 'https://slack/p',
    });
  });

  it('rejects empty contentBase64 in schema before call', async () => {
    const call = jest.fn();
    const action = new SlackUploadFileAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as SlackClientFactory);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ contentBase64: '' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('returns mocked output on dry-run with mockOnDryRun=true', async () => {
    const call = jest.fn();
    const action = new SlackUploadFileAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as SlackClientFactory);
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
