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

  /**
   * Whether executing this action mutates external state (sends a message,
   * charges a card, writes/deletes a record, etc.). Defaults to `true` so the
   * platform is **safe-by-default**: during a dry-run ("Test"), side-effecting
   * actions are skipped before `run()` is ever called. Read-only actions
   * (get/list/find/search/read) MUST override this to `false` so they still
   * execute during a dry-run and feed realistic data to downstream nodes.
   */
  protected readonly sideEffect: boolean = true;

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    // Safe-by-default dry-run guard: never perform a real side effect during a
    // test run. This is enforced centrally so it can't be forgotten per-action.
    // (Read-only actions opt out via `sideEffect = false` and run normally.)
    if (context.isDryRun && this.sideEffect) {
      return this.buildDryRunOutput(input);
    }

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
      let refreshedThenFailed = false;
      if (typeof context.refreshConnection === 'function') {
        try {
          log?.warn?.('connector.refresh_attempt', { connectionId, provider: connection.provider });
          const refreshed = await context.refreshConnection<TConfig>(connectionId);
          log?.warn?.('connector.refresh_success_retrying', {
            connectionId,
            provider: connection.provider,
          });
          refreshedThenFailed = true;
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
            refreshedThenFailed,
          });
          // Refresh itself failed, or the retry call also hit an auth error.
          // Fall through to the existing mark-for-refresh path below.
          if (refreshedThenFailed && !this.isAuthError(retryError)) {
            // Non-auth retry failure AFTER a successful refresh (W5.13): the
            // token refresh SUCCEEDED, so the credential is healthy — a provider
            // 5xx / timeout / node bug on the retry is NOT evidence the
            // connection is bad. Do NOT mark it for refresh (which would set
            // status=EXPIRED and bump the lockout counter, sticky-disabling a
            // working connection). Surface the underlying error untouched so the
            // engine treats it as a normal transient failure.
            //
            // NOTE: this is gated on `refreshedThenFailed`. If `refreshConnection`
            // itself threw (refresh FAILED, never set the flag), the credential
            // genuinely couldn't be refreshed, so we fall through to the
            // mark-for-refresh path below — that case is a real auth problem.
            throw retryError;
          }
        }
      }

      await context.markConnectionForRefresh(connectionId);
      // When refresh DID succeed but the retry still failed with 401/403, the
      // problem isn't an expired token — it's almost always an insufficient-
      // scope grant (the user authorized the connection without the scopes
      // this node needs). Surface that distinction in the error message so
      // the UI can guide them to reconnect rather than wait for an automatic
      // recovery that will never come.
      const message = refreshedThenFailed
        ? `Connection "${connectionId}" still rejected after token refresh — the connection likely lacks the OAuth scope this action needs. Revoke and reconnect with the required permissions.`
        : `Connection "${connectionId}" returned auth error; marked for refresh`;
      throw new ConnectionAuthError(message, {
        connectionId,
        provider: connection.provider,
        cause: error,
      });
    }
  }

  protected abstract run(
    input: NodeInput,
    connection: DecryptedConnection<TConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput>;

  /**
   * Output returned in place of a real side effect during a dry-run. Subclasses
   * MAY override to return a richer provider-shaped mock for downstream nodes;
   * the default is a generic, clearly-marked no-op.
   */
  protected buildDryRunOutput(_input: NodeInput): NodeOutput {
    return {
      // `mocked` is kept for backward compatibility with nodes/tests that keyed
      // off it; `dryRun`/`skipped` are the canonical flags going forward.
      data: { mocked: true, dryRun: true, skipped: true },
      metadata: {
        mocked: true,
        dryRun: true,
        skipped: true,
        reason: 'side-effecting action skipped during dry-run',
        nodeType: this.type,
      },
    };
  }

  protected isAuthError(error: unknown): boolean {
    if (error === null || typeof error !== 'object') return false;
    const e = error as AuthErrorLike;
    const status = e.status ?? e.statusCode ?? e.response?.status;
    return status === 401 || status === 403;
  }
}
