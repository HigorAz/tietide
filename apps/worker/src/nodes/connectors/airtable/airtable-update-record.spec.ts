import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableUpdateRecordAction } from './airtable-update-record';
import {
  AirtableHttpError,
  type AirtableClientFactory,
  type AirtableResponse,
} from './airtable-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const BASE_ID = 'appAAAAAAAAAAAAAA';
const TABLE = 'tblBBBBBBBBBB';
const RECORD_ID = 'recCCCCCC';

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
    recordId: RECORD_ID,
    fields: { Status: 'Done' },
    ...overrides,
  },
});

describe('AirtableUpdateRecordAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: AirtableUpdateRecordAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new AirtableUpdateRecordAction(client as unknown as AirtableClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('airtable-update-record');
    expect(action.requiredConnectionType).toBe('airtable');
  });

  describe('happy path', () => {
    it('PATCHes /v0/:base/:table/:rec with { fields }', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: RECORD_ID, fields: { Status: 'Done' } },
      } as AirtableResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/v0/${BASE_ID}/${TABLE}/${RECORD_ID}`);
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body as string)).toEqual({ fields: { Status: 'Done' } });
      expect(result.data.id).toBe(RECORD_ID);
    });
  });

  describe('error handling', () => {
    it('rethrows AirtableHttpError(404)', async () => {
      call.mockRejectedValue(new AirtableHttpError(404, { error: { message: 'NOT_FOUND' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(AirtableHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed recordId', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ recordId: 'NOT-REC' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
