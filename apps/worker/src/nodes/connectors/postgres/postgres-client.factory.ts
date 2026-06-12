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

// A read query can be safely nested inside `SELECT * FROM (...)` so the cap is
// enforced by the database. Writes cannot, so they are passed through untouched.
function isReadQuery(text: string): boolean {
  return /^\s*\(*\s*(select|with)\b/i.test(text);
}

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

    // Push the row cap into the database via a wrapping LIMIT so the server
    // never streams more than `rowLimit` rows back to us. Applying the cap in
    // memory (slice after the fact) would still materialize the full result
    // set and can OOM the worker on a large table. Only read queries can be
    // safely wrapped; writes (INSERT/UPDATE/DELETE) are passed through as-is.
    const queryValues: unknown[] = [...values];
    let queryText = text;
    if (rowLimit !== undefined && isReadQuery(text)) {
      const inner = text.replace(/;\s*$/, '');
      queryText = `SELECT * FROM (${inner}) AS _capped LIMIT $${queryValues.length + 1}`;
      queryValues.push(rowLimit);
    }

    const result = await pool.query<R>(queryText, queryValues);

    const rows = result.rows;

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
