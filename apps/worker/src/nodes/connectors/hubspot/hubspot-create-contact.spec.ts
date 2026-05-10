import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { HubspotOAuth2Config } from '@tietide/shared';
import { HubspotCreateContactAction } from './hubspot-create-contact';
import {
  HubspotHttpError,
  type HubspotClientFactory,
  type HubspotResponse,
} from './hubspot-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<HubspotClientFactory, 'call' | 'baseUrl' | 'buildAuthHeaders'>> => ({
  call,
  baseUrl: jest.fn(),
  buildAuthHeaders: jest.fn(),
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

const makeConnection = (
  overrides: Partial<DecryptedConnection<HubspotOAuth2Config>> = {},
): DecryptedConnection<HubspotOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'hubspot',
  config: {
    accessToken: 'CN_token',
    refreshToken: 'CN_refresh',
    hubId: '12345',
  },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    ...overrides,
  },
});

describe('HubspotCreateContactAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: HubspotCreateContactAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new HubspotCreateContactAction(client as unknown as HubspotClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('hubspot-create-contact');
    expect(action.requiredConnectionType).toBe('hubspot');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('POSTs to /crm/v3/objects/contacts with mapped properties', async () => {
      call.mockResolvedValue({
        status: 201,
        data: {
          id: 'contact-1',
          properties: { email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe' },
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z',
        },
      } as HubspotResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      expect(call).toHaveBeenCalledTimes(1);
      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/crm/v3/objects/contacts');
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({
        properties: { email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe' },
      });
      expect(result.data.id).toBe('contact-1');
    });

    it('merges custom properties into the request body', async () => {
      call.mockResolvedValue({ status: 201, data: { id: 'c2' } } as HubspotResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(
        makeInput({ properties: { company: 'Acme', lifecyclestage: 'lead' } }),
        ctx,
      );
      const [, , init] = call.mock.calls[0];
      const payload = JSON.parse(init.body as string);
      expect(payload.properties.company).toBe('Acme');
      expect(payload.properties.lifecyclestage).toBe('lead');
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
      call.mockRejectedValue(new HubspotHttpError(401, { message: 'unauthorized' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth HTTP errors verbatim (400)', async () => {
      call.mockRejectedValue(new HubspotHttpError(400, { message: 'validation' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(HubspotHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed email before hitting the API', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ email: 'not-an-email' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data without hitting HubSpot when isDryRun + mockOnDryRun', async () => {
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
