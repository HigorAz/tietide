import { Injectable } from '@nestjs/common';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';
import { assertHealthUrlAllowed, SsrfBlockedError, type LookupFn } from '../ssrf-guard';

@Injectable()
export class OllamaHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'ollama';

  // `baseUrl` is fully user-controlled, so the probe is guarded against SSRF
  // (private/loopback/metadata ranges) before any fetch. `lookupFn` is
  // injectable so tests can simulate DNS resolution.
  private readonly lookupFn?: LookupFn;

  constructor(lookupFn?: LookupFn) {
    super();
    this.lookupFn = lookupFn;
  }

  // Ollama doesn't have a centrally hosted API — `baseUrl` is per-workspace and
  // pulled from the stored connection config. There is therefore no env-var
  // override (unlike Anthropic/OpenAI), but we keep the static factory for
  // symmetry with the rest of the registered checkers.
  static fromConfig(): OllamaHealthChecker {
    return new OllamaHealthChecker();
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { baseUrl?: unknown };
    if (typeof cfg.baseUrl !== 'string' || cfg.baseUrl.length === 0) {
      return { ok: false, message: 'Missing baseUrl in stored config', latencyMs: 0 };
    }
    if (!/^https?:\/\//.test(cfg.baseUrl)) {
      return { ok: false, message: 'baseUrl must use http:// or https://', latencyMs: 0 };
    }
    const base = cfg.baseUrl.replace(/\/+$/, '');
    try {
      await assertHealthUrlAllowed(`${base}/api/tags`, this.lookupFn);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return { ok: false, message: err.message, latencyMs: 0 };
      }
      throw err;
    }
    return this.perform(
      {
        url: `${base}/api/tags`,
        headers: {},
      },
      signal,
    );
  }
}
