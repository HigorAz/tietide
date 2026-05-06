import type { ExecutionContext, DecryptedConnection } from '../interfaces/context.interface.js';
import type {
  INodeExecutor,
  NodeInput,
  NodeOutput,
  OutputSchema,
} from '../interfaces/node.interface.js';
import {
  ConnectionAuthError,
  ConnectorMisconfiguredError,
} from '../errors/connection-auth-error.js';

interface AuthErrorLike {
  status?: number;
  statusCode?: number;
  response?: { status?: number };
}

export abstract class BaseConnectorAction<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> implements INodeExecutor {
  abstract readonly type: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly requiredConnectionType: string;
  readonly category = 'action' as const;
  readonly outputSchema?: OutputSchema;

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    const connectionId = input.connectionId;
    if (typeof connectionId !== 'string' || connectionId.length === 0) {
      throw new ConnectorMisconfiguredError(
        `Node "${this.type}" requires input.connectionId`,
        this.type,
      );
    }

    const connection = await context.getConnection<TConfig>(connectionId);

    try {
      return await this.run(input, connection, context);
    } catch (error) {
      if (this.isAuthError(error) && connection.refreshToken) {
        await context.markConnectionForRefresh(connectionId);
        throw new ConnectionAuthError(
          `Connection "${connectionId}" returned auth error; marked for refresh`,
          {
            connectionId,
            provider: connection.provider,
            cause: error,
          },
        );
      }
      throw error;
    }
  }

  protected abstract run(
    input: NodeInput,
    connection: DecryptedConnection<TConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput>;

  protected isAuthError(error: unknown): boolean {
    if (error === null || typeof error !== 'object') return false;
    const e = error as AuthErrorLike;
    const status = e.status ?? e.statusCode ?? e.response?.status;
    return status === 401 || status === 403;
  }
}
