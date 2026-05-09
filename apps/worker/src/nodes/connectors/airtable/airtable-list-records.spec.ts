import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableListRecordsAction } from './airtable-list-records';
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
    ...overrides,
  },
});

describe('AirtableListRecordsAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: AirtableListRecordsAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new AirtableListRecordsAction(client as unknown as AirtableClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('airtable-list-records');
    expect(action.requiredConnectionType).toBe('airtable');
  });

  describe('happy path', () => {
    it('GETs /v0/:base/:table with query params', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          records: [
            { id: 'rec1', fields: { Name: 'a' } },
            { id: 'rec2', fields: { Name: 'b' } },
          ],
          offset: 'next-cursor',
        },
      } as AirtableResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({
          filterByFormula: '{Status}="Todo"',
          maxRecords: 10,
          fields: ['Name', 'Status'],
        }),
        ctx,
      );

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/v0/${BASE_ID}/${TABLE}`);
      expect(init.method).toBe('GET');
      expect(init.query).toEqual({
        filterByFormula: '{Status}="Todo"',
        maxRecords: 10,
        fields: ['Name', 'Status'],
      });
      expect(result.data.count).toBe(2);
      expect(result.data.offset).toBe('next-cursor');
    });
  });

  describe('error handling', () => {
    it('rethrows AirtableHttpError on 422', async () => {
      call.mockRejectedValue(new AirtableHttpError(422, { error: { message: 'INVALID_FORMULA' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(AirtableHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects pageSize > 100', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ pageSize: 101 }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
