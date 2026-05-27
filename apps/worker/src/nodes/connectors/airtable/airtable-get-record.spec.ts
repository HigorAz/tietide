import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableGetRecordAction } from './airtable-get-record';
import {
  AirtableHttpError,
  type AirtableClientFactory,
  type AirtableResponse,
} from './airtable-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const BASE_ID = 'appAAAAAAAAAAAAAA';
const TABLE = 'Tasks';
const RECORD_ID = 'recAAAAAAAAAAAAAA';

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

const makeConnection = (
  overrides: Partial<DecryptedConnection<AirtableApiKeyConfig>> = {},
): DecryptedConnection<AirtableApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'airtable',
  config: { apiKey: 'patValid.AAA111' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    baseId: BASE_ID,
    tableIdOrName: TABLE,
    recordId: RECORD_ID,
    ...overrides,
  },
});

describe('AirtableGetRecordAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: AirtableGetRecordAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new AirtableGetRecordAction(client as unknown as AirtableClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('airtable-get-record');
    expect(action.requiredConnectionType).toBe('airtable');
  });

  describe('happy path', () => {
    it('GETs /v0/:base/:table/:record and maps fields', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: RECORD_ID, fields: { Name: 'a' }, createdTime: '2026-05-08T00:00:00Z' },
      } as AirtableResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/v0/${BASE_ID}/${TABLE}/${RECORD_ID}`);
      expect(init.method).toBe('GET');
      expect(result.data).toMatchObject({ id: RECORD_ID, fields: { Name: 'a' } });
    });
  });

  describe('auth and error handling', () => {
    it('rethrows AirtableHttpError(403) verbatim when no refresh token', async () => {
      call.mockRejectedValue(new AirtableHttpError(403, { error: { message: 'NOT_AUTHORIZED' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(AirtableHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('marks for refresh and wraps in ConnectionAuthError when refresh token present', async () => {
      call.mockRejectedValue(new AirtableHttpError(401, { error: { message: 'AUTH' } }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt-present' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });

  describe('schema rejection', () => {
    it('rejects a malformed recordId before hitting Airtable', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ recordId: 'bad' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
