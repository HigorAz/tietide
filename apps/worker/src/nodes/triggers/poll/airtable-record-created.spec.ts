import type { DecryptedConnection, PollContext } from '@tietide/sdk';
import type { AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableRecordCreatedTrigger } from './airtable-record-created';
import {
  type AirtableClientFactory,
  type AirtableResponse,
} from '../../connectors/airtable/airtable-client.factory';

jest.setTimeout(15000);

const BASE_ID = 'appAAAAAAAAAAAAAA';
const TABLE = 'Tasks';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<AirtableClientFactory, 'call' | 'baseUrl' | 'buildAuthHeader'>> => ({
  call,
  baseUrl: jest.fn(),
  buildAuthHeader: jest.fn(),
});

const connection = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'API_KEY',
  provider: 'airtable',
  config: { apiKey: 'patValid.AAA111' },
  refreshToken: undefined,
} as DecryptedConnection<AirtableApiKeyConfig>;

const makeCtx = (cursor: string | null): PollContext => ({
  workflowId: 'wf-1',
  nodeId: 'node-1',
  connection,
  config: { connectionId: connection.id, baseId: BASE_ID, tableIdOrName: TABLE },
  cursor,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
});

describe('AirtableRecordCreatedTrigger', () => {
  let call: jest.Mock;
  let trigger: AirtableRecordCreatedTrigger;

  beforeEach(() => {
    call = jest.fn();
    trigger = new AirtableRecordCreatedTrigger(
      makeClient(call) as unknown as AirtableClientFactory,
    );
  });

  it('declares type, required connection type, and a default interval', () => {
    expect(trigger.type).toBe('airtable-record-created');
    expect(trigger.requiredConnectionType).toBe('airtable');
    expect(trigger.defaultIntervalSeconds).toBeGreaterThan(0);
  });

  it('emits nothing on the first tick (null cursor) and seeds a cursor without querying', async () => {
    const result = await trigger.poll(makeCtx(null));
    expect(result.items).toEqual([]);
    expect(typeof result.newCursor).toBe('string');
    expect(call).not.toHaveBeenCalled();
  });

  it('queries with an IS_AFTER(CREATED_TIME()) filter and emits new records', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        records: [
          { id: 'rec1', fields: { Name: 'a' }, createdTime: '2026-05-08T12:00:00.000Z' },
          { id: 'rec2', fields: { Name: 'b' }, createdTime: '2026-05-07T00:00:00.000Z' },
        ],
      },
    } as AirtableResponse);

    const result = await trigger.poll(makeCtx('2026-05-05T00:00:00.000Z'));

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe(`/v0/${BASE_ID}/${TABLE}`);
    expect(init.query.filterByFormula).toContain('IS_AFTER(CREATED_TIME()');
    expect(init.query.filterByFormula).toContain('2026-05-05T00:00:00.000Z');
    expect(result.items).toHaveLength(2);
    expect(result.newCursor).toBe('2026-05-08T12:00:00.000Z');
  });

  it('keeps the cursor when no new records are returned', async () => {
    call.mockResolvedValue({ status: 200, data: { records: [] } } as AirtableResponse);
    const result = await trigger.poll(makeCtx('2026-05-05T00:00:00.000Z'));
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('2026-05-05T00:00:00.000Z');
  });

  it('throws when baseId is missing from config', async () => {
    const ctx = makeCtx(null);
    (ctx.config as Record<string, unknown>).baseId = '';
    await expect(trigger.poll(ctx)).rejects.toThrow(/baseId/);
  });
});
