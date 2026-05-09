import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableCreateRecordAction } from './airtable-create-record';
import {
  AirtableHttpError,
  type AirtableClientFactory,
  type AirtableResponse,
} from './airtable-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const BASE_ID = 'appAAAAAAAAAAAAAA';
const TABLE = 'Tasks';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<AirtableClientFactory, 'call' | 'baseUrl' | 'buildAuthHeader'>> => ({
  call,
  baseUrl: jest.fn(),
  buildAuthHeader: jest.fn(),
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

const makeConnection = (): DecryptedConnection<AirtableApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'airtable',
  config: { apiKey: 'patValid.AAA111' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    baseId: BASE_ID,
    tableIdOrName: TABLE,
    fields: { Name: 'first task', Status: 'Todo' },
    ...overrides,
  },
});

describe('AirtableCreateRecordAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: AirtableCreateRecordAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new AirtableCreateRecordAction(client as unknown as AirtableClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('airtable-create-record');
    expect(action.requiredConnectionType).toBe('airtable');
  });

  describe('happy path', () => {
    it('POSTs to /v0/:base/:table with { fields }', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          id: 'recABC',
          fields: { Name: 'first task', Status: 'Todo' },
          createdTime: '2026-05-08T00:00:00.000Z',
        },
      } as AirtableResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ typecast: true }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/v0/${BASE_ID}/${TABLE}`);
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({
        fields: { Name: 'first task', Status: 'Todo' },
        typecast: true,
      });
      expect(result.data.id).toBe('recABC');
    });
  });

  describe('error handling', () => {
    it('rethrows AirtableHttpError on 401', async () => {
      call.mockRejectedValue(new AirtableHttpError(401, { error: { message: 'invalid token' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(AirtableHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed baseId', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ baseId: 'NOT_A_BASE' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data', async () => {
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
