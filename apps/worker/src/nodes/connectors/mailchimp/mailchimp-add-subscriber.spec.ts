import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpAddSubscriberAction } from './mailchimp-add-subscriber';
import {
  MailchimpHttpError,
  type MailchimpClientFactory,
  type MailchimpResponse,
} from './mailchimp-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({
    call,
    baseUrl: jest.fn(),
    buildAuthHeaders: jest.fn(),
  }) as unknown as MailchimpClientFactory;

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeConnection = (): DecryptedConnection<MailchimpApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'mailchimp',
  config: { apiKey: 'abc-us1', dataCenter: 'us1' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    listId: 'abc1234567',
    email: 'jane@example.com',
    ...overrides,
  },
});

describe('MailchimpAddSubscriberAction', () => {
  let call: jest.Mock;
  let action: MailchimpAddSubscriberAction;

  beforeEach(() => {
    call = jest.fn();
    action = new MailchimpAddSubscriberAction(makeClient(call));
  });

  it('declares correct type', () => {
    expect(action.type).toBe('mailchimp-add-subscriber');
    expect(action.requiredConnectionType).toBe('mailchimp');
  });

  it('PUTs to /lists/:listId/members/:hash with email_address + status_if_new', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        id: 'subscriber-1',
        email_address: 'jane@example.com',
        status: 'subscribed',
        list_id: 'abc1234567',
      },
    } as MailchimpResponse);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    const [, path, init] = call.mock.calls[0];
    // md5("jane@example.com") = aa934030cdd2dd3c5e0c64d75bdb5fb1
    expect(path).toMatch(/^\/lists\/abc1234567\/members\/[a-f0-9]{32}$/);
    expect(init.method).toBe('PUT');
    const payload = JSON.parse(init.body as string);
    expect(payload).toMatchObject({
      email_address: 'jane@example.com',
      status_if_new: 'subscribed',
    });
    expect(result.data.email).toBe('jane@example.com');
  });

  it('lowercases the email when computing the subscriber hash', async () => {
    call.mockResolvedValue({ status: 200, data: { id: 's1' } } as MailchimpResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(makeInput({ email: 'Jane@Example.com' }), ctx);
    const [, path1] = call.mock.calls[0];
    call.mockClear();
    await action.execute(makeInput({ email: 'jane@example.com' }), ctx);
    const [, path2] = call.mock.calls[0];
    expect(path1).toBe(path2);
  });

  it('rejects malformed listId', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ listId: '!@#$' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rethrows non-auth errors', async () => {
    call.mockRejectedValue(new MailchimpHttpError(500, { detail: 'down' }));
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(MailchimpHttpError);
  });

  it('returns mocked data on dry-run + mockOnDryRun', async () => {
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
