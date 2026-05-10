import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolConfig } from 'pg';
import type { DecryptedConnection } from '@tietide/sdk';
import type { PostgresCustomConfig } from '@tietide/shared';

// Per-process pool cache keyed by the encrypted connection-string. Re-using
// pools across executions avoids opening a TCP socket on every node run.
// Capped LRU prevents leaks when many distinct connections are used.
const MAX_POOLS = 10;
const DEFAULT_POOL_MAX = 5;
const IDLE_TIMEOUT_MS = 30_000;

export interface PgQueryResult<R = Record<string, unknown>> {
  rows: R[];
  rowCount: number;
  fields: { name: string; dataTypeID: number }[];
}

@Injectable()
export class PostgresClientFactory implements OnModuleDestroy {
  private readonly pools = new Map<string, Pool>();

  private getPool(connectionString: string): Pool {
    const existing = this.pools.get(connectionString);
    if (existing) {
      // Move to end (LRU).
      this.pools.delete(connectionString);
      this.pools.set(connectionString, existing);
      return existing;
    }

    const config: PoolConfig = {
      connectionString,
      max: DEFAULT_POOL_MAX,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: 10_000,
    };
    const pool = new Pool(config);
    pool.on('error', () => {
      // Swallow background errors — surfaced to the action through the next query call.
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

  async query<R extends Record<string, unknown> = Record<string, unknown>>(
    connection: DecryptedConnection<PostgresCustomConfig>,
    text: string,
    values: ReadonlyArray<string | number | boolean | null> = [],
    rowLimit?: number,
  ): Promise<PgQueryResult<R>> {
    const pool = this.getPool(connection.config.connectionString);
    const result = await pool.query<R>(text, values as unknown[]);

    let rows = result.rows;
    if (rowLimit !== undefined && rows.length > rowLimit) {
      rows = rows.slice(0, rowLimit);
    }

    return {
      rows,
      rowCount: result.rowCount ?? rows.length,
      fields: (result.fields ?? []).map((f: { name: string; dataTypeID: number }) => ({
        name: f.name,
        dataTypeID: f.dataTypeID,
      })),
    };
  }

  async onModuleDestroy(): Promise<void> {
    const closures = Array.from(this.pools.values()).map((p) => p.end().catch(() => undefined));
    this.pools.clear();
    await Promise.all(closures);
  }
}
