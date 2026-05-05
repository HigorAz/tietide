export const SECRET_RESOLVER = Symbol('SECRET_RESOLVER');

export interface SecretResolver {
  getSecret(executionId: string, name: string): Promise<string>;
  releaseExecution(executionId: string): void;
}

export class SecretNotFoundError extends Error {
  constructor(name: string) {
    super(`Secret "${name}" not found`);
    this.name = 'SecretNotFoundError';
  }
}
