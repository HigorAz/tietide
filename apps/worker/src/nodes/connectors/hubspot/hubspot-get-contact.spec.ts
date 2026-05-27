import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { HubspotOAuth2Config } from '@tietide/shared';
import { HubspotGetContactAction } from './hubspot-get-contact';
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
  params: { connectionId: VALID_CONNECTION_ID, contactId: '501', ...overrides },
});

describe('HubspotGetContactAction', () => {
  let call: jest.Mock;
  let action: HubspotGetContactAction;

  beforeEach(() => {
    call = jest.fn();
    action = new HubspotGetContactAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('hubspot-get-contact');
    expect(action.requiredConnectionType).toBe('hubspot');
  });

  describe('happy path', () => {
    it('GETs /crm/v3/objects/contacts/:id', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: '501', properties: { email: 'jane@example.com' } },
      } as HubspotResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/crm/v3/objects/contacts/501');
      expect(init.method).toBe('GET');
      expect(result.data.id).toBe('501');
    });
  });

  describe('auth and error handling', () => {
    it('rethrows 401 verbatim when connection has no refresh token', async () => {
      call.mockRejectedValue(new HubspotHttpError(401, { message: 'unauthorized' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(HubspotHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('marks for refresh + ConnectionAuthError on 401 when refresh token present', async () => {
      call.mockRejectedValue(new HubspotHttpError(401, { message: 'unauthorized' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });

  describe('schema rejection', () => {
    it('rejects a non-numeric contact id', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ contactId: 'abc' }), ctx)).rejects.toThrow();
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
