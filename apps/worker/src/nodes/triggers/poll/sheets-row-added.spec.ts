import { SheetsRowAddedTrigger } from './sheets-row-added';

describe('SheetsRowAddedTrigger', () => {
  let trigger: SheetsRowAddedTrigger;
  let authService: { buildClient: jest.Mock };
  let clients: { sheets: jest.Mock };
  let sheetsClient: { spreadsheets: { values: { get: jest.Mock } } };

  beforeEach(() => {
    sheetsClient = { spreadsheets: { values: { get: jest.fn() } } };
    clients = { sheets: jest.fn(() => sheetsClient) };
    authService = { buildClient: jest.fn(() => ({ auth: 'fake-oauth-client' })) };
    trigger = new SheetsRowAddedTrigger(authService as never, clients as never);
  });

  function makeCtx(cursor: string | null, config: Record<string, unknown> = {}) {
    return {
      workflowId: 'wf-1',
      nodeId: 'trigger-1',
      cursor,
      config: {
        spreadsheetId: 'sheet-abc',
        range: 'Sheet1!A:C',
        ...config,
      },
      connection: {
        id: 'conn-1',
        type: 'OAUTH2',
        provider: 'google',
        config: {
          accessToken: 'tok',
          refreshToken: 'rtok',
          scope: 'https://www.googleapis.com/auth/spreadsheets',
          tokenType: 'Bearer',
        },
      },
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as never;
  }

  it('exposes a 5-minute default interval', () => {
    expect(trigger.defaultIntervalSeconds).toBe(300);
  });

  it('reuses GoogleAuthService.buildClient', async () => {
    sheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [['a'], ['b']] },
    });

    await trigger.poll(makeCtx(null));

    expect(authService.buildClient).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1' }));
  });

  it('emits no items on first run when sheet is empty', async () => {
    sheetsClient.spreadsheets.values.get.mockResolvedValue({ data: { values: [] } });
    const result = await trigger.poll(makeCtx(null));
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('0');
  });

  it('seeds the cursor on the first run without emitting historical rows', async () => {
    sheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [['header'], ['r1'], ['r2'], ['r3']] },
    });

    const result = await trigger.poll(makeCtx(null));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('4');
  });

  it('emits one item per new row when row count grows beyond cursor', async () => {
    sheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [['h'], ['1'], ['2'], ['3'], ['4'], ['5']] },
    });

    const result = await trigger.poll(makeCtx('3'));

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({ rowNumber: 4, values: ['3'] });
    expect(result.items[2]).toMatchObject({ rowNumber: 6, values: ['5'] });
    expect(result.newCursor).toBe('6');
  });

  it('emits nothing and keeps cursor unchanged when sheet has not grown', async () => {
    sheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [['h'], ['1'], ['2'], ['3']] },
    });

    const result = await trigger.poll(makeCtx('4'));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('4');
  });

  it('re-baselines the cursor (not stuck high) when the sheet shrinks from deleted rows', async () => {
    // cursor was 5 but the sheet now has only 2 rows — a regression. Holding the
    // cursor at 5 would silently drop every row added until the sheet re-exceeds 5.
    sheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [['h'], ['1']] },
    });

    const result = await trigger.poll(makeCtx('5'));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('2');
  });

  it('emits new rows correctly on the tick after a shrink re-baseline', async () => {
    // After re-baselining to 2, a sheet that grows to 4 must emit the 2 new rows
    // (it would have stayed silent if the cursor were still stuck at the old 5).
    sheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [['h'], ['1'], ['x'], ['y']] },
    });

    const result = await trigger.poll(makeCtx('2'));

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ rowNumber: 3, values: ['x'] });
    expect(result.newCursor).toBe('4');
  });
});
