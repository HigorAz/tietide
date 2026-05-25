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
      if (!this.isAuthError(error) || !connection.refreshToken) {
        throw error;
      }

      // Diagnostic: emit a structured log line on every auth-error catch so the
      // operator can see which branch of the refresh-and-retry decision tree
      // ran. Optional — degrades silently if the host doesn't expose `logger`.
      const log = context.logger;
      log?.warn?.('connector.auth_error_caught', {
        nodeType: this.type,
        connectionId,
        provider: connection.provider,
        hasRefreshFn: typeof context.refreshConnection === 'function',
        errName: (error as { name?: unknown })?.name ?? null,
        errStatus:
          (error as { status?: unknown })?.status ??
          (error as { response?: { status?: unknown } })?.response?.status ??
          null,
      });

      // First auth-error path: if the host implements `refreshConnection`,
      // attempt an OAuth token refresh and retry the action once before
      // marking the connection as needing manual reconnection.
      if (typeof context.refreshConnection === 'function') {
        try {
          log?.warn?.('connector.refresh_attempt', { connectionId, provider: connection.provider });
          const refreshed = await context.refreshConnection<TConfig>(connectionId);
          log?.warn?.('connector.refresh_success_retrying', {
            connectionId,
            provider: connection.provider,
          });
          return await this.run(input, refreshed, context);
        } catch (retryError) {
          const rName = (retryError as { name?: unknown })?.name ?? null;
          const rMsg = (retryError as { message?: unknown })?.message ?? null;
          const rStatus =
            (retryError as { status?: unknown })?.status ??
            (retryError as { response?: { status?: unknown } })?.response?.status ??
            null;
          log?.warn?.('connector.refresh_or_retry_failed', {
            connectionId,
            provider: connection.provider,
            errName: rName,
            errMessage: rMsg,
            errStatus: rStatus,
            isAuthError: this.isAuthError(retryError),
          });
          // Refresh itself failed, or the retry call also hit an auth error.
          // Fall through to the existing mark-for-refresh path below.
          if (!this.isAuthError(retryError)) {
            // Non-auth retry failure: surface the underlying error rather than
            // masking it behind a generic ConnectionAuthError.
            await context.markConnectionForRefresh(connectionId);
            throw retryError;
          }
        }
      }

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
