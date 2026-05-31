import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { TieTideThrottlerGuard } from './tietide-throttler.guard';

/** Reach the protected getTracker for testing without going through DI. */
type TrackerFn = (req: Record<string, unknown>) => Promise<string>;

function makeGuard(verify: jest.Mock): { track: TrackerFn } {
  const guard = new TieTideThrottlerGuard(
    { throttlers: [] } as unknown as ThrottlerModuleOptions,
    {} as ThrottlerStorage,
    new Reflector(),
    { verify } as unknown as JwtService,
  );
  return { track: (req) => (guard as unknown as { getTracker: TrackerFn }).getTracker(req) };
}

describe('TieTideThrottlerGuard.getTracker (W3.3)', () => {
  it('buckets by verified userId when a valid bearer token is present', async () => {
    const verify = jest.fn().mockReturnValue({ sub: 'user-1' });
    const { track } = makeGuard(verify);

    const key = await track({ ip: '203.0.113.5', headers: { authorization: 'Bearer good.tok' } });

    expect(key).toBe('user:user-1');
    expect(verify).toHaveBeenCalledWith('good.tok');
  });

  it('keeps one user in a single bucket across different IPs', async () => {
    const verify = jest.fn().mockReturnValue({ sub: 'user-1' });
    const { track } = makeGuard(verify);

    const a = await track({ ip: '203.0.113.5', headers: { authorization: 'Bearer t' } });
    const b = await track({ ip: '198.51.100.9', headers: { authorization: 'Bearer t' } });

    expect(a).toBe('user:user-1');
    expect(b).toBe('user:user-1');
  });

  it('falls back to IP when there is no Authorization header', async () => {
    const verify = jest.fn();
    const { track } = makeGuard(verify);

    const key = await track({ ip: '203.0.113.5', headers: {} });

    expect(key).toBe('203.0.113.5');
    expect(verify).not.toHaveBeenCalled();
  });

  it('falls back to IP when the token fails verification (forged/expired)', async () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const { track } = makeGuard(verify);

    const key = await track({ ip: '203.0.113.5', headers: { authorization: 'Bearer forged' } });

    expect(key).toBe('203.0.113.5');
  });

  it('does not bucket by an oauth-state token', async () => {
    const verify = jest.fn().mockReturnValue({ sub: 'user-1', aud: 'oauth-state' });
    const { track } = makeGuard(verify);

    const key = await track({ ip: '203.0.113.5', headers: { authorization: 'Bearer state.tok' } });

    expect(key).toBe('203.0.113.5');
  });

  it('ignores a non-Bearer scheme', async () => {
    const verify = jest.fn();
    const { track } = makeGuard(verify);

    const key = await track({ ip: '203.0.113.5', headers: { authorization: 'Basic abc' } });

    expect(key).toBe('203.0.113.5');
    expect(verify).not.toHaveBeenCalled();
  });
});
