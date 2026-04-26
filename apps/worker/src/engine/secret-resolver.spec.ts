import { StubSecretResolver, SECRET_RESOLVER } from './secret-resolver';

describe('StubSecretResolver', () => {
  describe('getSecret', () => {
    it('should reject with a not-implemented error', async () => {
      const resolver = new StubSecretResolver();

      await expect(resolver.getSecret('exec-1', 'API_KEY')).rejects.toThrow(/not implemented/i);
    });

    it('should reject regardless of executionId or secret name', async () => {
      const resolver = new StubSecretResolver();

      await expect(resolver.getSecret('', '')).rejects.toThrow();
      await expect(resolver.getSecret('exec-2', 'OTHER')).rejects.toThrow();
    });
  });

  describe('SECRET_RESOLVER token', () => {
    it('should be a unique symbol', () => {
      expect(typeof SECRET_RESOLVER).toBe('symbol');
      expect(SECRET_RESOLVER.toString()).toContain('SECRET_RESOLVER');
    });
  });
});
