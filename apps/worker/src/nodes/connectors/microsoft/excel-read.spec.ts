import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { ExcelReadAction } from './excel-read';
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
    range: 'A1:C5',
    ...overrides,
  },
});

describe('ExcelReadAction', () => {
  let graphFetch: jest.Mock;
  let auth: jest.Mocked<
    Pick<MicrosoftAuthService, 'graphFetch' | 'buildAuthHeader' | 'graphBaseUrl'>
  >;
  let action: ExcelReadAction;

  beforeEach(() => {
    graphFetch = jest.fn();
    auth = makeAuthService(graphFetch);
    action = new ExcelReadAction(auth as unknown as MicrosoftAuthService);
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('excel-read');
    expect(action.requiredConnectionType).toBe('microsoft');
  });

  it('GETs the worksheet range with $select query and returns values', async () => {
    graphFetch.mockResolvedValue({
      status: 200,
      data: {
        address: 'Sheet1!A1:C5',
        rowCount: 5,
        columnCount: 3,
        values: [
          ['a', 'b', 'c'],
          ['d', 'e', 'f'],
          ['g', 'h', 'i'],
          ['j', 'k', 'l'],
          ['m', 'n', 'o'],
        ],
      },
    } as GraphResponse);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    expect(graphFetch).toHaveBeenCalledTimes(1);
    const [, path] = graphFetch.mock.calls[0];
    expect(path).toBe(
      "/v1.0/me/drive/items/wb-1/workbook/worksheets('Sheet1')/range(address='A1:C5')?%24select=address%2CrowCount%2CcolumnCount%2Cvalues",
    );

    expect(result.data.values).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
      ['j', 'k', 'l'],
      ['m', 'n', 'o'],
    ]);
    expect(result.data.rowCount).toBe(5);
    expect(result.data.columnCount).toBe(3);
    expect(result.data.address).toBe('Sheet1!A1:C5');
  });

  it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
    graphFetch.mockRejectedValue(new GraphHttpError(401, {}));
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
    expect(ctx.markConnectionForRefresh).toHaveBeenCalled();
  });

  it('returns mocked data on dry-run + mockOnDryRun', async () => {
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(graphFetch).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });

  it('rejects malformed range that could inject Graph URL path segments', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ range: "A1:C5')/foo" }), ctx)).rejects.toThrow();
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it('accepts a single-cell range like A1', async () => {
    graphFetch.mockResolvedValue({
      status: 200,
      data: { address: 'Sheet1!A1', rowCount: 1, columnCount: 1, values: [[42]] },
    } as GraphResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput({ range: 'A1' }), ctx);
    expect(result.data.values).toEqual([[42]]);
  });
});
