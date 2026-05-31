/**
 * Template-engine error types. Extracted into their own module so both
 * `template-engine.ts` and `expression.ts` can import them without a circular
 * dependency (`template-engine.ts` → `expression.ts` is the one-way import).
 */

export class TemplatePathNotFoundError extends Error {
  public readonly path: string;
  constructor(path: string) {
    super(`Template path not found: ${path}`);
    this.name = 'TemplatePathNotFoundError';
    this.path = path;
  }
}

export class EnvVarNotFoundError extends Error {
  public readonly key: string;
  constructor(key: string) {
    super(`Env var ${key} not found in user or global scope`);
    this.name = 'EnvVarNotFoundError';
    this.key = key;
  }
}
