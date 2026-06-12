import type { DecryptedConnection } from '@tietide/sdk';
import type { MysqlCustomConfig } from '@tietide/shared';

jest.setTimeout(15000);

const executeMock = jest.fn();
const endMock = jest.fn().mockResolvedValue(undefined);

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn().mockImplementation(() => ({
    execute: executeMock,
    end: endMock,
  })),
}));

import { MysqlClientFactory } from './mysql-client.factory';

const makeConnection = (): DecryptedConnection<MysqlCustomConfig> => ({
  id: '11111111-1111-4111-8111-111111111111',
  type: 'CUSTOM',
  provider: 'mysql',
  config: { connectionString: 'mysql://user:pass@host:3306/db' },
  refreshToken: undefined,
});

describe('MysqlClientFactory', () => {
  let factory: MysqlClientFactory;

  beforeEach(() => {
    executeMock.mockReset();
    endMock.mockClear();
    factory = new MysqlClientFactory();
  });

  describe('rowLimit pushed into the DB', () => {
    it('wraps a SELECT in a LIMIT so the DB caps rows before materialization', async () => {
      executeMock.mockResolvedValue([[{ id: 0 }, { id: 1 }], [{ name: 'id', type: 3 }]]);

      await factory.query(makeConnection(), 'SELECT id FROM big_table', [], 2);

      expect(executeMock).toHaveBeenCalledTimes(1);
      const [text, values] = executeMock.mock.calls[0];
      expect(text).toMatch(/limit/i);
      expect(values).toContain(2);
    });

    it('reports rowCount from the rows actually returned post-cap', async () => {
      executeMock.mockResolvedValue([[{ id: 0 }, { id: 1 }], [{ name: 'id', type: 3 }]]);

      const result = await factory.query(makeConnection(), 'SELECT id FROM big_table', [], 2);

      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
    });

    it('does not wrap non-SELECT statements (INSERT/UPDATE/DELETE)', async () => {
      executeMock.mockResolvedValue([{ affectedRows: 1 }, undefined]);

      await factory.query(makeConnection(), 'UPDATE t SET a = ? WHERE id = ?', ['x', '1'], 100);

      const [text] = executeMock.mock.calls[0];
      expect(text).toBe('UPDATE t SET a = ? WHERE id = ?');
    });
  });
});
