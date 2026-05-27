import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { ExcelFindRowAction } from './excel-find-row';
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
  config: { accessToken: 'at', refreshToken: 'rt', scope: 'Files.Read', tokenType: 'Bearer' },
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
    column: 'Status',
    value: 'active',
    ...overrides,
  },
});

const HEADER = ['Name', 'Email', 'Status'];
const ROWS = [
  { index: 0, values: [['Alice', 'alice@example.com', 'active']] },
  { index: 1, values: [['Bob', 'bob@example.com', 'inactive']] },
  { index: 2, values: [['Carol', 'carol@example.com', 'active']] },
];

// Resolve headerRowRange + rows calls by path.
const mockTable = (graphFetch: jest.Mock, header = HEADER, rows = ROWS): void => {
  graphFetch.mockImplementation((_conn: unknown, path: string) => {
    if (path.endsWith('/headerRowRange')) {
      return Promise.resolve({ status: 200, data: { values: [header] } } as GraphResponse);
    }
    if (path.includes('/rows')) {
      return Promise.resolve({ status: 200, data: { value: rows } } as GraphResponse);
    }
    return Promise.resolve({ status: 200, data: {} } as GraphResponse);
  });
};

describe('ExcelFindRowAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: ExcelFindRowAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new ExcelFindRowAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('excel-find-row');
    expect(action.requiredConnectionType).toBe('microsoft');
    expect(action.category).toBe('action');
  });

  describe('matching', () => {
    it('returns a single match with its row index and resolved column index', async () => {
      mockTable(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ column: 'Email', value: 'bob@example.com' }),
        ctx,
      );
      expect(result.data.matchCount).toBe(1);
      expect(result.data.columnIndex).toBe(1);
      expect(result.data.matchedRows).toEqual([
        { rowIndex: 1, values: ['Bob', 'bob@example.com', 'inactive'] },
      ]);
    });

    it('returns multiple matches', async () => {
      mockTable(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ column: 'Status', value: 'active' }), ctx);
      expect(result.data.matchCount).toBe(2);
      const indices = (result.data.matchedRows as { rowIndex: number }[]).map((r) => r.rowIndex);
      expect(indices).toEqual([0, 2]);
    });

    it('returns no matches when nothing equals the value', async () => {
      mockTable(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ value: 'deleted' }), ctx);
      expect(result.data.matchCount).toBe(0);
      expect(result.data.matchedRows).toEqual([]);
    });

    it('supports contains and startsWith match modes', async () => {
      mockTable(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const contains = await action.execute(
        makeInput({ column: 'Email', value: 'example.com', matchMode: 'contains' }),
        ctx,
      );
      expect(contains.data.matchCount).toBe(3);

      const starts = await action.execute(
        makeInput({ column: 'Name', value: 'Ca', matchMode: 'startsWith' }),
        ctx,
      );
      expect(starts.data.matchCount).toBe(1);
    });

    it('honours maxMatches by stopping early', async () => {
      mockTable(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ column: 'Email', value: 'example.com', matchMode: 'contains', maxMatches: 1 }),
        ctx,
      );
      expect(result.data.matchCount).toBe(1);
    });

    it('throws when the named column is not in the table header', async () => {
      mockTable(graphFetch);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ column: 'Nope' }), ctx)).rejects.toThrow(/not found/);
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks connection for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(401, { error: { code: 'Unauthorized' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 (permission denied)', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(403, { error: { code: 'Forbidden' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      graphFetch.mockRejectedValue(new GraphHttpError(404, { error: { message: 'no table' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GraphHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a missing column before Graph is called', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ column: undefined }), ctx)).rejects.toThrow();
      expect(graphFetch).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call graphFetch when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(graphFetch).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.data.matchCount).toBe(0);
    });
  });
});
