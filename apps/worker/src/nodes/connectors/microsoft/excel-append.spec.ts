import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { ExcelAppendAction } from './excel-append';
import type { MicrosoftAuthService, GraphResponse } from './microsoft-auth';
import { GraphHttpError } from './microsoft-auth';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeAuthService = (
  graphFetch: jest.Mock = jest.fn(),
): jest.Mocked<Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>> => ({
  graphFetch,
  buildAuthHeader: jest.fn(),
  graphBaseUrl: jest.fn(),
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

const makeConnection = (): DecryptedConnection<MicrosoftOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'microsoft',
  config: {
    accessToken: 'at',
    refreshToken: 'rt',
    scope: 'Files.ReadWrite',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt',
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    workbookId: 'wb-1',
    worksheet: 'Sheet1',
    values: [['a', 'b', 'c']],
    ...overrides,
  },
});

describe('ExcelAppendAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: ExcelAppendAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new ExcelAppendAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('excel-append');
    expect(action.requiredConnectionType).toBe('microsoft');
  });

  describe('happy path', () => {
    it('appends below the bottom row when usedRange has data (Sheet1!A1:C12 → row 13)', async () => {
      // First call: usedRange GET
      graphFetch.mockResolvedValueOnce({
        status: 200,
        data: {
          address: 'Sheet1!A1:C12',
          rowCount: 12,
          columnCount: 3,
          values: [['header', 'header', 'header']],
        },
      } as GraphResponse);
      // Second call: PATCH range
      graphFetch.mockResolvedValueOnce({
        status: 200,
        data: {
          address: 'Sheet1!A13:C13',
          rowCount: 1,
          columnCount: 3,
        },
      } as GraphResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      expect(graphFetch).toHaveBeenCalledTimes(2);

      const [, getPath, getInit] = graphFetch.mock.calls[0];
      expect(getPath).toBe(
        "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/usedRange?%24select=address%2CrowCount%2CcolumnCount%2Cvalues",
      );
      expect(getInit === undefined || (getInit as { method?: string }).method === undefined).toBe(
        true,
      );

      const [, patchPath, patchInit] = graphFetch.mock.calls[1];
      expect(patchPath).toBe(
        "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='A13:C13')",
      );
      expect(patchInit.method).toBe('PATCH');
      const body = JSON.parse(patchInit.body as string) as { values: unknown[][] };
      expect(body.values).toEqual([['a', 'b', 'c']]);

      expect(result.data.appendedRowCount).toBe(1);
      expect(result.data.address).toBe('A13:C13');
      expect(result.data.anchor).toBe('A13');
    });

    it('appends multiple rows: 2 rows after row 12 → A13:C14', async () => {
      graphFetch.mockResolvedValueOnce({
        status: 200,
        data: {
          address: 'Sheet1!A1:C12',
          rowCount: 12,
          columnCount: 3,
          values: [['h', 'h', 'h']],
        },
      } as GraphResponse);
      graphFetch.mockResolvedValueOnce({ status: 200, data: {} } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(
        makeInput({
          values: [
            ['x', 'y', 'z'],
            ['p', 'q', 'r'],
          ],
        }),
        ctx,
      );
      const [, patchPath] = graphFetch.mock.calls[1];
      expect(patchPath).toBe(
        "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='A13:C14')",
      );
    });

    it('starts at A1 when sheet is empty (usedRange returns A1 with empty values)', async () => {
      graphFetch.mockResolvedValueOnce({
        status: 200,
        data: {
          address: 'Sheet1!A1',
          rowCount: 1,
          columnCount: 1,
          values: [[null]],
        },
      } as GraphResponse);
      graphFetch.mockResolvedValueOnce({ status: 200, data: {} } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, patchPath] = graphFetch.mock.calls[1];
      expect(patchPath).toBe(
        "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='A1:C1')",
      );
      expect(result.data.anchor).toBe('A1');
    });

    it('starts at A1 when usedRange returns 404 (empty sheet)', async () => {
      graphFetch.mockRejectedValueOnce(
        new GraphHttpError(404, { error: { code: 'ItemNotFound' } }),
      );
      graphFetch.mockResolvedValueOnce({ status: 200, data: {} } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput(), ctx);
      const [, patchPath] = graphFetch.mock.calls[1];
      expect(patchPath).toBe(
        "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='A1:C1')",
      );
    });

    it('computes column letter for >26 columns (e.g. 27 cols → AA)', async () => {
      graphFetch.mockResolvedValueOnce({
        status: 200,
        data: { address: 'Sheet1!A1', rowCount: 1, columnCount: 1, values: [[null]] },
      } as GraphResponse);
      graphFetch.mockResolvedValueOnce({ status: 200, data: {} } as GraphResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const wideRow = Array.from({ length: 27 }, (_, i) => `c${i}`);
      await action.execute(makeInput({ values: [wideRow] }), ctx);
      const [, patchPath] = graphFetch.mock.calls[1];
      expect(patchPath).toBe(
        "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='A1:AA1')",
      );
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 from usedRange and marks for refresh', async () => {
      graphFetch.mockRejectedValueOnce(new GraphHttpError(401, {}));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalled();
    });

    it('rethrows non-auth/non-404 errors verbatim from usedRange', async () => {
      graphFetch.mockRejectedValueOnce(new GraphHttpError(500, {}));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GraphHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('throws ConnectionAuthError on 401 from PATCH and marks for refresh', async () => {
      graphFetch.mockResolvedValueOnce({
        status: 200,
        data: { address: 'Sheet1!A1:C12', rowCount: 12, columnCount: 3, values: [['h']] },
      } as GraphResponse);
      graphFetch.mockRejectedValueOnce(new GraphHttpError(401, {}));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and skips both Graph calls', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(graphFetch).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects empty values array', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ values: [] }), ctx)).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });

    it('rejects empty workbookId', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ workbookId: '' }), ctx)).rejects.toThrow();
    });
  });
});
