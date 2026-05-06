import { NotFoundException } from '@nestjs/common';
import { ProviderHealthRegistry } from './provider-health.registry';
import type { ProviderHealthChecker } from './provider-health.types';

describe('ProviderHealthRegistry', () => {
  const stub = (provider: string): ProviderHealthChecker => ({
    provider,
    check: async () => ({ ok: true, latencyMs: 0 }),
  });

  it('should register and resolve a checker by its provider id', () => {
    const registry = new ProviderHealthRegistry();
    const checker = stub('openai');

    registry.register(checker);

    expect(registry.get('openai')).toBe(checker);
    expect(registry.has('openai')).toBe(true);
  });

  it('should throw NotFoundException for an unregistered provider', () => {
    const registry = new ProviderHealthRegistry();

    expect(() => registry.get('twilio')).toThrow(NotFoundException);
    expect(registry.has('twilio')).toBe(false);
  });

  it('should overwrite when the same provider is registered twice', () => {
    const registry = new ProviderHealthRegistry();
    const first = stub('openai');
    const second = stub('openai');

    registry.register(first);
    registry.register(second);

    expect(registry.get('openai')).toBe(second);
  });
});
