import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { MysqlCustomConfig } from '@tietide/shared';
import { MysqlRunQueryAction } from './mysql-run-query';
import type { MysqlClientFactory } from './mysql-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (query: jest.Mock = jest.fn()) => ({ query }) as unknown as MysqlClientFactory;

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeConnection = (): DecryptedConnection<MysqlCustomConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'CUSTOM',
  provider: 'mysql',
  config: { connectionString: 'mysql://user:pass@host:3306/db' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    query: 'SELECT * FROM users WHERE id = ?',
    params: ['abc'],
    ...overrides,
  },
});

describe('MysqlRunQueryAction', () => {
  let query: jest.Mock;
  let action: MysqlRunQueryAction;

  beforeEach(() => {
    query = jest.fn();
    action = new MysqlRunQueryAction(makeClient(query));
  });

  it('declares correct type', () => {
    expect(action.type).toBe('mysql-run-query');
    expect(action.requiredConnectionType).toBe('mysql');
  });

  it('forwards query and params to the pool', async () => {
    query.mockResolvedValue({
      rows: [{ id: 1, email: 'a@b.com' }],
      rowCount: 1,
      fields: [
        { name: 'id', type: 3 },
        { name: 'email', type: 254 },
      ],
    });
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);
    const [, text, values] = query.mock.calls[0];
    expect(text).toBe('SELECT * FROM users WHERE id = ?');
    expect(values).toEqual(['abc']);
    expect(result.data.rowCount).toBe(1);
  });

  it('rejects multi-statement', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(
      action.execute(makeInput({ query: 'SELECT 1; DROP TABLE users', params: [] }), ctx),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects # comment', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(
      action.execute(makeInput({ query: 'SELECT 1 # bypass', params: [] }), ctx),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects placeholder/param mismatch', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(
      action.execute(makeInput({ query: 'SELECT ?, ?', params: ['only-one'] }), ctx),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('returns mocked data on dry-run', async () => {
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(query).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
