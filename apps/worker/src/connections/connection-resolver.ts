import type { DecryptedConnection } from '@tietide/sdk';

export const CONNECTION_RESOLVER = Symbol('CONNECTION_RESOLVER');

export interface ConnectionResolver {
  getConnection<TConfig = Record<string, unknown>>(
    executionId: string,
    connectionId: string,
  ): Promise<DecryptedConnection<TConfig>>;
  markForRefresh(executionId: string, connectionId: string): Promise<void>;
  // Best-effort in-flight OAuth refresh. Looks up the connection, calls the
  // provider's token endpoint with the stored refresh_token, persists the
  // rotated tokens (encrypted), refreshes the per-execution cache and
  // returns the new decrypted shape. Throws if the provider is not
  // refreshable (e.g. API-key connections) or the token endpoint refuses
  // the refresh request.
  refreshConnection<TConfig = Record<string, unknown>>(
    executionId: string,
    connectionId: string,
  ): Promise<DecryptedConnection<TConfig>>;
  releaseExecution(executionId: string): void;
}

export class ConnectionNotFoundError extends Error {
  readonly connectionId: string;

  constructor(connectionId: string) {
    super(`Connection "${connectionId}" not found`);
    this.name = 'ConnectionNotFoundError';
    this.connectionId = connectionId;
  }
}
