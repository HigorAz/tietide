export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export interface DecryptedConnection<TConfig = Record<string, unknown>> {
  id: string;
  type: string;
  provider: string;
  config: TConfig;
  refreshToken?: string;
}

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  nodeId: string;
  logger: Logger;
  isDryRun: boolean;
  getSecret(name: string): Promise<string>;
  getConnection<TConfig = Record<string, unknown>>(
    connectionId: string,
  ): Promise<DecryptedConnection<TConfig>>;
  markConnectionForRefresh(connectionId: string): Promise<void>;
}
