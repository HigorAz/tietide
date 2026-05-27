import type { DecryptedConnection, PollContext } from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { ExcelRowUpdatedTrigger } from './excel-row-updated';
import type {
  MicrosoftAuthService,
  GraphResponse,
} from '../../connectors/microsoft/microsoft-auth';

jest.setTimeout(15000);

const makeAuthService = (
  graphFetch: jest.Mock,
): jest.Mocked<Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>> => ({
  graphFetch,
  buildAuthHeader: jest.fn(),
  graphBaseUrl: jest.fn(),
});

const connection = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'OAUTH2',
  provider: 'microsoft',
  config: { accessToken: 'at', refreshToken: 'rt', scope: 'Files.Read', tokenType: 'Bearer' },
  refreshToken: 'rt',
} as DecryptedConnection<MicrosoftOAuth2Config>;

const makeCtx = (cursor: string | null): PollContext => ({
  workflowId: 'wf-1',
  nodeId: 'node-1',
  connection,
  config: { workbookId: 'wb-1', worksheet: 'Sheet1', tableName: 'Table1' },
  cursor,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
});

describe('ExcelRowUpdatedTrigger', () => {
  let graphFetch: jest.Mock;
  let trigger: ExcelRowUpdatedTrigger;

  beforeEach(() => {
    graphFetch = jest.fn();
    trigger = new ExcelRowUpdatedTrigger(
      makeAuthService(graphFetch) as unknown as MicrosoftAuthService,
    );
  });

  const setRows = (rows: unknown[]): void => {
    graphFetch.mockResolvedValue({ status: 200, data: { value: rows } } as GraphResponse);
  };

  it('declares type, name, required connection type, and a default interval', () => {
    expect(trigger.type).toBe('excel-row-updated');
    expect(trigger.requiredConnectionType).toBe('microsoft');
    expect(trigger.defaultIntervalSeconds).toBeGreaterThan(0);
  });

  it('emits nothing on the first tick (null cursor) and seeds the hash map', async () => {
    setRows([
      { index: 0, values: [['Alice', 'active']] },
      { index: 1, values: [['Bob', 'inactive']] },
    ]);

    const result = await trigger.poll(makeCtx(null));

    expect(result.items).toEqual([]);
    const cursor = JSON.parse(result.newCursor) as Record<string, string>;
    expect(Object.keys(cursor)).toEqual(['0', '1']);
  });

  it('emits only rows whose values changed since the previous tick', async () => {
    setRows([
      { index: 0, values: [['Alice', 'active']] },
      { index: 1, values: [['Bob', 'inactive']] },
    ]);
    const first = await trigger.poll(makeCtx(null));

    // Row 1 changes; row 0 stays the same.
    setRows([
      { index: 0, values: [['Alice', 'active']] },
      { index: 1, values: [['Bob', 'active']] },
    ]);
    const second = await trigger.poll(makeCtx(first.newCursor));

    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({
      rowIndex: 1,
      values: [['Bob', 'active']],
      workbookId: 'wb-1',
      worksheet: 'Sheet1',
      tableName: 'Table1',
    });
  });

  it('does not emit brand-new rows (only changes to existing rows)', async () => {
    setRows([{ index: 0, values: [['Alice', 'active']] }]);
    const first = await trigger.poll(makeCtx(null));

    // Row 0 unchanged, row 1 is new.
    setRows([
      { index: 0, values: [['Alice', 'active']] },
      { index: 1, values: [['Bob', 'new']] },
    ]);
    const second = await trigger.poll(makeCtx(first.newCursor));

    expect(second.items).toEqual([]);
  });

  it('emits nothing when no row changed', async () => {
    const rows = [{ index: 0, values: [['Alice', 'active']] }];
    setRows(rows);
    const first = await trigger.poll(makeCtx(null));
    setRows(rows);
    const second = await trigger.poll(makeCtx(first.newCursor));
    expect(second.items).toEqual([]);
  });

  it('throws when workbookId is missing from config', async () => {
    const ctx = makeCtx(null);
    (ctx.config as Record<string, unknown>).workbookId = '';
    await expect(trigger.poll(ctx)).rejects.toThrow(/workbookId/);
  });
});
