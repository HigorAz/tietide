// Aligned with the pino log redactor (logger.config.ts) and the audit-log
// sanitizer (audit-log.service.ts) so all three redaction surfaces drop the
// same crypto/credential key set. Broad substring match — defense-in-depth on
// the user-facing execution payload (ownership-scoped, same-user only).
const SENSITIVE_KEY_PATTERN =
  /password|token|secret|apikey|authorization|cookie|credential|nonce|encryptionkey|privatekey|client_secret|configencrypted|confignonce|valueenc|valuenonce|hmacsecret|^iv$|^value$|^config$/i;

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
