import { validate } from 'class-validator';
import { IsSafeNodeConfig } from './safe-node-config.validator';

class Holder {
  @IsSafeNodeConfig()
  config!: unknown;

  constructor(config: unknown) {
    this.config = config;
  }
}

async function failsValidation(config: unknown): Promise<boolean> {
  const errors = await validate(new Holder(config));
  return errors.some((e) => e.property === 'config' && e.constraints?.isSafeNodeConfig != null);
}

describe('IsSafeNodeConfig (W2.7 HTTP boundary)', () => {
  it('rejects a config carrying a raw __proto__ own key', async () => {
    // JSON.parse keeps `__proto__` as an own enumerable key — the shape a request
    // body arrives in before zod ever runs. This is the layer that must reject it.
    const config = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    expect(Object.keys(config)).toContain('__proto__');
    expect(await failsValidation(config)).toBe(true);
  });

  it('rejects a config carrying a nested constructor key', async () => {
    expect(await failsValidation({ a: { constructor: { evil: true } } })).toBe(true);
  });

  it('rejects a config nested beyond the maximum depth', async () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 30; i++) deep = { nested: deep };
    expect(await failsValidation(deep)).toBe(true);
  });

  it('accepts a normal nested config with arrays', async () => {
    expect(
      await failsValidation({
        method: 'GET',
        headers: { 'x-a': '1' },
        items: [1, 2, { ok: true }],
      }),
    ).toBe(false);
  });

  it('accepts an empty config object', async () => {
    expect(await failsValidation({})).toBe(false);
  });
});
