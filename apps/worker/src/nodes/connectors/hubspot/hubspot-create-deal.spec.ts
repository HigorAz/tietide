import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { HubspotOAuth2Config } from '@tietide/shared';
import { HubspotCreateDealAction } from './hubspot-create-deal';
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
    name: 'Big deal',
    amount: 5000,
    pipelineId: '111',
    stageId: '222',
    ...overrides,
  },
});

describe('HubspotCreateDealAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: HubspotCreateDealAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new HubspotCreateDealAction(client as unknown as HubspotClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('hubspot-create-deal');
    expect(action.requiredConnectionType).toBe('hubspot');
  });

  describe('happy path', () => {
    it('POSTs to /crm/v3/objects/deals with mapped property names', async () => {
      call.mockResolvedValue({
        status: 201,
        data: { id: 'deal-1', properties: { dealname: 'Big deal' } },
      } as HubspotResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/crm/v3/objects/deals');
      const payload = JSON.parse(init.body as string);
      expect(payload.properties).toEqual({
        dealname: 'Big deal',
        amount: '5000',
        pipeline: '111',
        dealstage: '222',
      });
      expect(payload.associations).toBeUndefined();
      expect(result.data.id).toBe('deal-1');
    });

    it('attaches deal-to-contact associations when contactIds provided', async () => {
      call.mockResolvedValue({ status: 201, data: { id: 'd2' } } as HubspotResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ contactIds: ['77', '88'] }), ctx);

      const [, , init] = call.mock.calls[0];
      const payload = JSON.parse(init.body as string);
      expect(payload.associations).toHaveLength(2);
      expect(payload.associations[0]).toEqual({
        to: { id: '77' },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
      });
    });
  });

  describe('auth and error handling', () => {
    it('marks for refresh on 403 when refresh token present', async () => {
      call.mockRejectedValue(new HubspotHttpError(403, { message: 'forbidden' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('does not mark for refresh on 500', async () => {
      call.mockRejectedValue(new HubspotHttpError(500, { message: 'internal' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(HubspotHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects empty deal name', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ name: '' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });

    it('rejects negative amount', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ amount: -1 }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data when dry-run + mockOnDryRun', async () => {
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
