export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  nodeId: string;
  logger: Logger;
  getSecret(name: string): Promise<string>;
}
