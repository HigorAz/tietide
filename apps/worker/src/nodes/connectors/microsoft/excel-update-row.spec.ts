import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { ExcelUpdateRowAction } from './excel-update-row';
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
  config: { accessToken: 'at', refreshToken: 'rt', scope: 'Files.ReadWrite', tokenType: 'Bearer' },
  refreshToken: 'rt',
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    workbookId: 'wb-1',
    worksheet: 'Sheet1',
    tableName: 'Table1',
    values: ['Bob', 'bob@new.com', 'active'],
    rowIndex: 1,
    ...overrides,
  },
});

const HEADER = ['Name', 'Email', 'Status'];
const ROWS = [
  { index: 0, values: [['Alice', 'alice@example.com', 'active']] },
  { index: 1, values: [['Bob', 'bob@example.com', 'inactive']] },
  { index: 2, values: [['Carol', 'carol@example.com', 'active']] },
];

const mockTableAndPatch = (graphFetch: jest.Mock, rows = ROWS): void => {
  graphFetch.mockImplementation((_conn: unknown, path: string) => {
    if (path.endsWith('/headerRowRange')) {
      return Promise.resolve({ status: 200, data: { values: [HEADER] } } as GraphResponse);
    }
    if (path.includes('/rows/itemAt')) {
      return Promise.resolve({ status: 200, data: { index: 1 } } as GraphResponse);
    }
    if (path.includes('/rows')) {
      return Promise.resolve({ status: 200, data: { value: rows } } as GraphResponse);
    }
    return Promise.resolve({ status: 200, data: {} } as GraphResponse);
  });
};

describe('ExcelUpdateRowAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: ExcelUpdateRowAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new ExcelUpdateRowAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('excel-update-row');
    expect(action.requiredConnectionType).toBe('microsoft');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('PATCHes itemAt(index) directly when rowIndex is supplied', async () => {
      mockTableAndPatch(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput({ rowIndex: 1 }), ctx);

      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [, path, init] = graphFetch.mock.calls[0];
      expect(path).toBe(
        "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/tables('Table1')/rows/itemAt(index=1)",
      );
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body as string)).toEqual({
        values: [['Bob', 'bob@new.com', 'active']],
      });
      expect(result.data).toEqual({ rowIndex: 1, updated: true });
    });

    it('resolves the index via a unique lookup then PATCHes that row', async () => {
      mockTableAndPatch(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(
        makeInput({ rowIndex: undefined, lookup: { column: 'Email', value: 'bob@example.com' } }),
        ctx,
      );

      // header + rows + patch = 3 calls
      expect(graphFetch).toHaveBeenCalledTimes(3);
      const patchCall = graphFetch.mock.calls.find((c) => String(c[1]).includes('/rows/itemAt'));
      expect(patchCall?.[1]).toContain('itemAt(index=1)');
      expect(result.data.rowIndex).toBe(1);
    });

    it('throws when the lookup matches no rows', async () => {
      mockTableAndPatch(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(
          makeInput({ rowIndex: undefined, lookup: { column: 'Email', value: 'nobody@x.com' } }),
          ctx,
        ),
      ).rejects.toThrow(/No row matched/);
    });

    it('throws when the lookup matches multiple rows', async () => {
      mockTableAndPatch(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(
          makeInput({ rowIndex: undefined, lookup: { column: 'Status', value: 'active' } }),
          ctx,
        ),
      ).rejects.toThrow(/matched 2 rows/);
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks connection for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(401, { error: { code: 'Unauthorized' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ rowIndex: 1 }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 (permission denied)', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(403, { error: { code: 'Forbidden' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ rowIndex: 1 }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(400, { error: { message: 'bad' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ rowIndex: 1 }), ctx)).rejects.toBeInstanceOf(
        GraphHttpError,
      );
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects supplying both rowIndex and lookup', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ rowIndex: 1, lookup: { column: 'Email', value: 'x' } }), ctx),
      ).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });

    it('rejects supplying neither rowIndex nor lookup', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ rowIndex: undefined }), ctx)).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call graphFetch when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ rowIndex: 1, mockOnDryRun: true }), ctx);
      expect(graphFetch).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
