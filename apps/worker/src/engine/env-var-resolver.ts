import type { EnvScope } from '@tietide/shared';

export const ENV_VAR_RESOLVER = Symbol('ENV_VAR_RESOLVER');

export interface EnvVarResolver {
  /**
   * Loads (or returns the cached) merged env-var scope for the execution. The
   * map merges GLOBAL vars with the executing user's USER vars; USER values
   * override GLOBAL values when keys collide.
   */
  getEnvScope(executionId: string): Promise<EnvScope>;

  /**
   * Drops the cached entry for the execution. Called from WorkflowRunner's
   * finally block.
   */
  releaseExecution(executionId: string): void;
}
