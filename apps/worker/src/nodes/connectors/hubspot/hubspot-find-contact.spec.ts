import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { HubspotOAuth2Config } from '@tietide/shared';
import { HubspotFindContactAction } from './hubspot-find-contact';
import {
  HubspotHttpError,
  type HubspotClientFactory,
  type HubspotResponse,
} from './hubspot-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({ call, baseUrl: jest.fn(), buildAuthHeaders: jest.fn() }) as unknown as HubspotClientFactory;

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

const makeConnection = (
  overrides: Partial<DecryptedConnection<HubspotOAuth2Config>> = {},
): DecryptedConnection<HubspotOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'hubspot',
  config: { accessToken: 'tok', refreshToken: 'rt', hubId: '1' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, email: 'jane@example.com', ...overrides },
});

describe('HubspotFindContactAction', () => {
  let call: jest.Mock;
  let action: HubspotFindContactAction;

  beforeEach(() => {
    call = jest.fn();
    action = new HubspotFindContactAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('hubspot-find-contact');
    expect(action.requiredConnectionType).toBe('hubspot');
  });

  describe('happy path', () => {
    it('POSTs an email EQ filter and returns the first match', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { total: 1, results: [{ id: '501', properties: { email: 'jane@example.com' } }] },
      } as HubspotResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/crm/v3/objects/contacts/search');
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload.filterGroups[0].filters[0]).toMatchObject({
        propertyName: 'email',
        operator: 'EQ',
        value: 'jane@example.com',
      });
      expect(result.data.found).toBe(true);
      expect((result.data.contact as { id?: string }).id).toBe('501');
    });

    it('returns found=false when there is no match', async () => {
      call.mockResolvedValue({ status: 200, data: { total: 0, results: [] } } as HubspotResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);
      expect(result.data.found).toBe(false);
      expect(result.data.contact).toBeNull();
    });
  });

  describe('auth and error handling', () => {
    it('rethrows 401 verbatim when connection has no refresh token', async () => {
      call.mockRejectedValue(new HubspotHttpError(401, { message: 'unauthorized' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(HubspotHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('marks for refresh and wraps as ConnectionAuthError when refresh token present', async () => {
      call.mockRejectedValue(new HubspotHttpError(403, { message: 'forbidden' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });

  describe('schema rejection', () => {
    it('rejects a malformed email before hitting HubSpot', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ email: 'nope' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('skips network call on dry-run + mockOnDryRun', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(call).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
