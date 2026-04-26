import { sanitizePayload } from './sanitize-payload';

describe('sanitizePayload', () => {
  it('should return null when input is null or undefined', () => {
    expect(sanitizePayload(null)).toBeNull();
    expect(sanitizePayload(undefined)).toBeNull();
  });

  it('should redact secret-like top-level keys', () => {
    const input = {
      password: 'p@ss',
      token: 'jwt.value',
      apiKey: 'sk-123',
      authorization: 'Bearer abc',
      secret: 'hush',
      cookie: 'sid=xyz',
      credential: 'a',
      safe: 'value',
    };
    const result = sanitizePayload(input) as Record<string, unknown>;
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.authorization).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.cookie).toBe('[REDACTED]');
    expect(result.credential).toBe('[REDACTED]');
    expect(result.safe).toBe('value');
  });

  it('should match secret keys case-insensitively and via substring', () => {
    const input = {
      Password: 'a',
      ACCESS_TOKEN: 'b',
      myApiKey: 'c',
      Secret_Value: 'd',
    };
    const result = sanitizePayload(input) as Record<string, unknown>;
    expect(result.Password).toBe('[REDACTED]');
    expect(result.ACCESS_TOKEN).toBe('[REDACTED]');
    expect(result.myApiKey).toBe('[REDACTED]');
    expect(result.Secret_Value).toBe('[REDACTED]');
  });

  it('should recurse into nested objects', () => {
    const input = {
      headers: { Authorization: 'Bearer t', 'X-Custom': 'ok' },
      user: { name: 'Ada', password: 'shh' },
    };
    const result = sanitizePayload(input) as {
      headers: Record<string, unknown>;
      user: Record<string, unknown>;
    };
    expect(result.headers.Authorization).toBe('[REDACTED]');
    expect(result.headers['X-Custom']).toBe('ok');
    expect(result.user.name).toBe('Ada');
    expect(result.user.password).toBe('[REDACTED]');
  });

  it('should sanitize objects inside arrays', () => {
    const input = {
      items: [
        { name: 'a', token: 't1' },
        { name: 'b', password: 'p2' },
      ],
    };
    const result = sanitizePayload(input) as { items: Array<Record<string, unknown>> };
    expect(result.items[0].token).toBe('[REDACTED]');
    expect(result.items[0].name).toBe('a');
    expect(result.items[1].password).toBe('[REDACTED]');
    expect(result.items[1].name).toBe('b');
  });

  it('should leave primitives and arrays of primitives unchanged', () => {
    expect(sanitizePayload('hello')).toBe('hello');
    expect(sanitizePayload(42)).toBe(42);
    expect(sanitizePayload(true)).toBe(true);
    expect(sanitizePayload([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('should not mutate the input object', () => {
    const input = { password: 'p', nested: { token: 't' } };
    const snapshot = JSON.parse(JSON.stringify(input));
    sanitizePayload(input);
    expect(input).toEqual(snapshot);
  });
});
