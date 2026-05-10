import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { postgresRunQueryConfigSchema, type PostgresCustomConfig } from '@tietide/shared';
import { PostgresClientFactory } from './postgres-client.factory';

export const POSTGRES_RUN_QUERY_TYPE = 'postgres-run-query';

@Injectable()
export class PostgresRunQueryAction extends BaseConnectorAction<PostgresCustomConfig> {
  readonly type = POSTGRES_RUN_QUERY_TYPE;
  readonly name = 'Postgres: Run Parameterized Query';
  readonly description = 'Run a parameterized SQL query against a Postgres database';
  readonly requiredConnectionType = 'postgres';

  constructor(private readonly client: PostgresClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<PostgresCustomConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = postgresRunQueryConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, rows: [], rowCount: 0 },
        metadata: { mocked: true },
      };
    }

    // Driver-level parameterization: pg.query(text, values) uses the underlying
    // PostgreSQL extended-query protocol — values are sent as separate parameters
    // and never interpolated into the SQL string. This is the primary defence.
    // The schema's superRefine adds defence-in-depth comment / multi-statement
    // rejection on top of that.
    const result = await this.client.query(
      connection,
      params.query,
      (params.params ?? []) as ReadonlyArray<string | number | boolean | null>,
      params.rowLimit,
    );

    return {
      data: {
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields,
      },
      metadata: { statusCode: 200 },
    };
  }
}
