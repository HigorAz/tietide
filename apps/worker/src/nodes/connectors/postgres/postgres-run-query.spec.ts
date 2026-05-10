import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { PostgresCustomConfig } from '@tietide/shared';
import { PostgresRunQueryAction } from './postgres-run-query';
import type { PostgresClientFactory } from './postgres-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (query: jest.Mock = jest.fn()) =>
  ({ query }) as unknown as PostgresClientFactory;

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

const makeConnection = (): DecryptedConnection<PostgresCustomConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'CUSTOM',
  provider: 'postgres',
  config: { connectionString: 'postgresql://user:pass@host:5432/db' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    query: 'SELECT * FROM users WHERE id = $1',
    params: ['abc'],
    ...overrides,
  },
});

describe('PostgresRunQueryAction', () => {
  let query: jest.Mock;
  let action: PostgresRunQueryAction;

  beforeEach(() => {
    query = jest.fn();
    action = new PostgresRunQueryAction(makeClient(query));
  });

  it('declares correct type', () => {
    expect(action.type).toBe('postgres-run-query');
    expect(action.requiredConnectionType).toBe('postgres');
  });

  describe('happy path', () => {
    it('forwards query and params to the pool, returning rows', async () => {
      query.mockResolvedValue({
        rows: [{ id: 'abc', email: 'a@b.com' }],
        rowCount: 1,
        fields: [
          { name: 'id', dataTypeID: 25 },
          { name: 'email', dataTypeID: 25 },
        ],
      });

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      expect(query).toHaveBeenCalledTimes(1);
      const [, text, values] = query.mock.calls[0];
      expect(text).toBe('SELECT * FROM users WHERE id = $1');
      expect(values).toEqual(['abc']);
      expect(result.data.rowCount).toBe(1);
      expect((result.data.rows as unknown[]).length).toBe(1);
    });

    it('caps rows at rowLimit', async () => {
      query.mockResolvedValue({
        rows: Array.from({ length: 5 }, (_, i) => ({ id: i })),
        rowCount: 5,
        fields: [{ name: 'id', dataTypeID: 23 }],
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      // The factory respects rowLimit, so we feed it through.
      query.mockImplementation(async (_conn, _text, _values, rowLimit) => {
        const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
        return {
          rows: rowLimit ? rows.slice(0, rowLimit) : rows,
          rowCount: 5,
          fields: [{ name: 'id', dataTypeID: 23 }],
        };
      });
      await action.execute(makeInput({ query: 'SELECT id FROM t', params: [], rowLimit: 2 }), ctx);
      const [, , , limit] = query.mock.calls[0];
      expect(limit).toBe(2);
    });
  });

  describe('SQL hardening at action layer', () => {
    it('rejects multi-statement queries before hitting the pool', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ query: 'SELECT 1; DROP TABLE x', params: [] }), ctx),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects -- comments before hitting the pool', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ query: 'SELECT * FROM users -- bypass', params: [] }), ctx),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects placeholder/param mismatch before hitting the pool', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ query: 'SELECT $1, $2', params: ['only-one'] }), ctx),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data without connecting on dry-run + mockOnDryRun', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(query).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
