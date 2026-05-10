import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import type { DecryptedConnection } from '@tietide/sdk';
import type { MysqlCustomConfig } from '@tietide/shared';

const MAX_POOLS = 10;
const DEFAULT_POOL_LIMIT = 5;
const IDLE_TIMEOUT_MS = 30_000;

export interface MysqlQueryResult<R = Record<string, unknown>> {
  rows: R[];
  rowCount: number;
  fields: { name: string; type: number | undefined }[];
}

@Injectable()
export class MysqlClientFactory implements OnModuleDestroy {
  private readonly pools = new Map<string, mysql.Pool>();

  private getPool(connectionString: string): mysql.Pool {
    const existing = this.pools.get(connectionString);
    if (existing) {
      this.pools.delete(connectionString);
      this.pools.set(connectionString, existing);
      return existing;
    }

    const pool = mysql.createPool({
      uri: connectionString,
      connectionLimit: DEFAULT_POOL_LIMIT,
      idleTimeout: IDLE_TIMEOUT_MS,
      connectTimeout: 10_000,
      // Disable multipleStatements explicitly even though it is the default;
      // an attacker who somehow bypasses our schema validation still cannot
      // run a second statement on the same connection.
      multipleStatements: false,
    });

    this.pools.set(connectionString, pool);
    this.evictIfFull();
    return pool;
  }

  private evictIfFull(): void {
    while (this.pools.size > MAX_POOLS) {
      const oldestKey = this.pools.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.pools.get(oldestKey);
      this.pools.delete(oldestKey);
      void oldest?.end().catch(() => undefined);
    }
  }

  async query<R = Record<string, unknown>>(
    connection: DecryptedConnection<MysqlCustomConfig>,
    text: string,
    values: ReadonlyArray<string | number | boolean | null> = [],
    rowLimit?: number,
  ): Promise<MysqlQueryResult<R>> {
    const pool = this.getPool(connection.config.connectionString);
    const [rowsRaw, fieldsRaw] = await pool.execute(text, [...values] as Array<
      string | number | boolean | null
    >);

    const rows: R[] = Array.isArray(rowsRaw) ? (rowsRaw as unknown as R[]) : [];
    const limited =
      rowLimit !== undefined && rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;

    const fields = Array.isArray(fieldsRaw)
      ? (fieldsRaw as Array<{ name: string; type?: number }>).map((f) => ({
          name: f.name,
          type: f.type,
        }))
      : [];

    return { rows: limited, rowCount: rows.length, fields };
  }

  async onModuleDestroy(): Promise<void> {
    const closures = Array.from(this.pools.values()).map((p) => p.end().catch(() => undefined));
    this.pools.clear();
    await Promise.all(closures);
  }
}
