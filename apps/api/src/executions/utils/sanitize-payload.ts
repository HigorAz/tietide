const SENSITIVE_KEY_PATTERN = /password|token|secret|apikey|authorization|cookie|credential/i;

const REDACTED = '[REDACTED]';

export function sanitizePayload(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  return walk(value);
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => walk(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : walk(v);
    }
    return out;
  }
  return value;
}
