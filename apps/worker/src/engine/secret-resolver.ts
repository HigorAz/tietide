export const SECRET_RESOLVER = Symbol('SECRET_RESOLVER');

export interface SecretResolver {
  getSecret(executionId: string, name: string): Promise<string>;
}

export class StubSecretResolver implements SecretResolver {
  async getSecret(_executionId: string, _name: string): Promise<string> {
    throw new Error('Secret resolution not implemented in S4');
  }
}
