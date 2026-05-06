import type { DecryptedConnection } from '@tietide/sdk';

export const CONNECTION_RESOLVER = Symbol('CONNECTION_RESOLVER');

export interface ConnectionResolver {
  getConnection<TConfig = Record<string, unknown>>(
    executionId: string,
    connectionId: string,
  ): Promise<DecryptedConnection<TConfig>>;
  markForRefresh(executionId: string, connectionId: string): Promise<void>;
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
