import type { DecryptedConnection } from '@tietide/sdk';
import type { PostgresCustomConfig } from '@tietide/shared';

jest.setTimeout(15000);

const queryMock = jest.fn();
const endMock = jest.fn().mockResolvedValue(undefined);
const onMock = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: queryMock,
    end: endMock,
    on: onMock,
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { PostgresClientFactory } from './postgres-client.factory';

const makeConnection = (): DecryptedConnection<PostgresCustomConfig> => ({
  id: '11111111-1111-4111-8111-111111111111',
  type: 'CUSTOM',
  provider: 'postgres',
  config: { connectionString: 'postgresql://user:pass@host:5432/db' },
  refreshToken: undefined,
});

describe('PostgresClientFactory', () => {
  let factory: PostgresClientFactory;

  beforeEach(() => {
    queryMock.mockReset();
    endMock.mockClear();
    onMock.mockClear();
    factory = new PostgresClientFactory();
  });

  describe('rowLimit pushed into the DB', () => {
    it('wraps a SELECT in a LIMIT so the DB caps rows before materialization', async () => {
      queryMock.mockResolvedValue({
        rows: [{ id: 0 }, { id: 1 }],
        rowCount: 2,
        fields: [{ name: 'id', dataTypeID: 23 }],
      });

      await factory.query(makeConnection(), 'SELECT id FROM big_table', [], 2);

      expect(queryMock).toHaveBeenCalledTimes(1);
      const [text, values] = queryMock.mock.calls[0];
      // The limit must be enforced by the database, not by an in-process slice.
      expect(text).toMatch(/limit/i);
      // The limit value must be passed as a bound parameter, not interpolated.
      expect(values).toContain(2);
    });

    it('reports rowCount from the rows actually returned post-cap', async () => {
      queryMock.mockResolvedValue({
        rows: [{ id: 0 }, { id: 1 }],
        rowCount: 2,
        fields: [{ name: 'id', dataTypeID: 23 }],
      });

      const result = await factory.query(makeConnection(), 'SELECT id FROM big_table', [], 2);

      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
    });

    it('does not wrap non-SELECT statements (INSERT/UPDATE/DELETE)', async () => {
      queryMock.mockResolvedValue({ rows: [], rowCount: 1, fields: [] });

      await factory.query(makeConnection(), 'UPDATE t SET a = $1 WHERE id = $2', ['x', '1'], 100);

      const [text] = queryMock.mock.calls[0];
      expect(text).toBe('UPDATE t SET a = $1 WHERE id = $2');
    });
  });
});
