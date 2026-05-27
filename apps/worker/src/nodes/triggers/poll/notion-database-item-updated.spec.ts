import type { DecryptedConnection, PollContext } from '@tietide/sdk';
import type { NotionOAuth2Config } from '@tietide/shared';
import { NotionDatabaseItemUpdatedTrigger } from './notion-database-item-updated';
import {
  type NotionClientFactory,
  type NotionResponse,
} from '../../connectors/notion/notion-client.factory';

jest.setTimeout(15000);

const DB_ID = '0123456789abcdef0123456789abcdef';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<
  Pick<NotionClientFactory, 'call' | 'baseUrl' | 'notionVersion' | 'buildAuthHeaders'>
> => ({
  call,
  baseUrl: jest.fn(),
  notionVersion: jest.fn(),
  buildAuthHeaders: jest.fn(),
});

const connection = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'OAUTH2',
  provider: 'notion',
  config: { accessToken: 'secret_valid', workspaceId: 'ws_1' },
  refreshToken: undefined,
} as DecryptedConnection<NotionOAuth2Config>;

const makeCtx = (cursor: string | null): PollContext => ({
  workflowId: 'wf-1',
  nodeId: 'node-1',
  connection,
  config: { connectionId: connection.id, databaseId: DB_ID },
  cursor,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
});

describe('NotionDatabaseItemUpdatedTrigger', () => {
  let call: jest.Mock;
  let trigger: NotionDatabaseItemUpdatedTrigger;

  beforeEach(() => {
    call = jest.fn();
    trigger = new NotionDatabaseItemUpdatedTrigger(
      makeClient(call) as unknown as NotionClientFactory,
    );
  });

  it('declares type, required connection type, and a default interval', () => {
    expect(trigger.type).toBe('notion-database-item-updated');
    expect(trigger.requiredConnectionType).toBe('notion');
    expect(trigger.defaultIntervalSeconds).toBeGreaterThan(0);
  });

  it('emits nothing on the first tick (null cursor) and seeds a cursor without querying', async () => {
    const result = await trigger.poll(makeCtx(null));
    expect(result.items).toEqual([]);
    expect(typeof result.newCursor).toBe('string');
    expect(result.newCursor.length).toBeGreaterThan(0);
    expect(call).not.toHaveBeenCalled();
  });

  it('emits only items edited after the cursor and advances the cursor', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        results: [
          { id: 'p2', last_edited_time: '2026-05-08T12:00:00.000Z' },
          { id: 'p1', last_edited_time: '2026-05-01T00:00:00.000Z' },
        ],
      },
    } as NotionResponse);

    const result = await trigger.poll(makeCtx('2026-05-05T00:00:00.000Z'));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'p2', databaseId: DB_ID });
    expect(result.newCursor).toBe('2026-05-08T12:00:00.000Z');
  });

  it('emits nothing when no item is newer than the cursor', async () => {
    call.mockResolvedValue({
      status: 200,
      data: { results: [{ id: 'p1', last_edited_time: '2026-05-01T00:00:00.000Z' }] },
    } as NotionResponse);
    const result = await trigger.poll(makeCtx('2026-05-05T00:00:00.000Z'));
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('2026-05-05T00:00:00.000Z');
  });

  it('throws when databaseId is missing from config', async () => {
    const ctx = makeCtx(null);
    (ctx.config as Record<string, unknown>).databaseId = '';
    await expect(trigger.poll(ctx)).rejects.toThrow(/databaseId/);
  });
});
