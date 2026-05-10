import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { mysqlRunQueryConfigSchema, type MysqlCustomConfig } from '@tietide/shared';
import { MysqlClientFactory } from './mysql-client.factory';

export const MYSQL_RUN_QUERY_TYPE = 'mysql-run-query';

@Injectable()
export class MysqlRunQueryAction extends BaseConnectorAction<MysqlCustomConfig> {
  readonly type = MYSQL_RUN_QUERY_TYPE;
  readonly name = 'MySQL: Run Parameterized Query';
  readonly description = 'Run a parameterized SQL query against a MySQL database';
  readonly requiredConnectionType = 'mysql';

  constructor(private readonly client: MysqlClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MysqlCustomConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = mysqlRunQueryConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, rows: [], rowCount: 0 },
        metadata: { mocked: true },
      };
    }

    // mysql2's pool.execute(text, values) uses the binary protocol: values are
    // bound at the wire level and never spliced into the query string.
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
