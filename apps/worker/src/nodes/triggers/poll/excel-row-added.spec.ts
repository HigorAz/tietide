import type { MicrosoftOAuth2Config } from '@tietide/shared';
import {
  GraphHttpError,
  type GraphResponse,
  type MicrosoftAuthService,
} from '../../connectors/microsoft/microsoft-auth';
import { ExcelRowAddedTrigger } from './excel-row-added';

const makeAuthService = (
  graphFetch: jest.Mock = jest.fn(),
): jest.Mocked<Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>> => ({
  graphFetch,
  buildAuthHeader: jest.fn(),
  graphBaseUrl: jest.fn(),
});

const makeCtx = (
  cursor: string | null,
  config: Record<string, unknown> = {},
): Parameters<ExcelRowAddedTrigger['poll']>[0] =>
  ({
    workflowId: 'wf-1',
    nodeId: 'trigger-1',
    cursor,
    config: {
      connectionId: '11111111-1111-4111-8111-111111111111',
      workbookId: 'wb-1',
      worksheet: 'Sheet1',
      tableName: 'Table1',
      ...config,
    },
    connection: {
      id: 'conn-1',
      type: 'OAUTH2',
      provider: 'microsoft',
      config: {
        accessToken: 'at',
        refreshToken: 'rt',
        scope: 'Files.Read',
        tokenType: 'Bearer',
      } as MicrosoftOAuth2Config,
      refreshToken: 'rt',
    },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  }) as unknown as Parameters<ExcelRowAddedTrigger['poll']>[0];

describe('ExcelRowAddedTrigger', () => {
  let trigger: ExcelRowAddedTrigger;
  let graphFetch: jest.Mock;

  beforeEach(() => {
    graphFetch = jest.fn();
    const auth = makeAuthService(graphFetch);
    trigger = new ExcelRowAddedTrigger(auth as unknown as MicrosoftAuthService);
  });

  it('exposes a 5-minute default interval', () => {
    expect(trigger.defaultIntervalSeconds).toBe(300);
  });

  it('seeds the cursor on the first tick without emitting historical rows', async () => {
    graphFetch.mockResolvedValue({
      status: 200,
      data: {
        value: [
          { index: 0, values: [['header']] },
          { index: 1, values: [['r1']] },
          { index: 2, values: [['r2']] },
        ],
      },
    } as GraphResponse);

    const result = await trigger.poll(makeCtx(null));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('3');
    const path = (graphFetch.mock.calls[0] as [unknown, string])[1];
    expect(path).toBe(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/tables('Table1')/rows",
    );
  });

  it('emits one item per new row beyond the cursor', async () => {
    // Two new rows since the previous tick (cursor = "3" → table now has 5 rows).
    graphFetch.mockResolvedValue({
      status: 200,
      data: {
        value: [
          { index: 3, values: [['r3']] },
          { index: 4, values: [['r4']] },
        ],
      },
    } as GraphResponse);

    const result = await trigger.poll(makeCtx('3'));

    expect(graphFetch).toHaveBeenCalledTimes(1);
    const path = (graphFetch.mock.calls[0] as [unknown, string])[1];
    expect(path).toContain('$skip=3');

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      rowIndex: 3,
      values: [['r3']],
      workbookId: 'wb-1',
      worksheet: 'Sheet1',
      tableName: 'Table1',
    });
    expect(result.items[1]).toMatchObject({ rowIndex: 4, values: [['r4']] });
    expect(result.newCursor).toBe('5');
  });

  it('emits nothing and keeps cursor unchanged when no new rows', async () => {
    graphFetch.mockResolvedValue({
      status: 200,
      data: { value: [] },
    } as GraphResponse);

    const result = await trigger.poll(makeCtx('5'));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('5');
  });

  it('throws when required config is missing', async () => {
    await expect(trigger.poll(makeCtx(null, { workbookId: '' }))).rejects.toThrow(/workbookId/i);
  });

  it('propagates 401 GraphHttpError so PollProcessor surfaces auth failure', async () => {
    graphFetch.mockRejectedValue(new GraphHttpError(401, { code: 'InvalidAuthenticationToken' }));

    await expect(trigger.poll(makeCtx('3'))).rejects.toBeInstanceOf(GraphHttpError);
  });
});
