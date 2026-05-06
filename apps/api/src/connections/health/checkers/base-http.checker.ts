import { ProviderHealthChecker, ProviderHealthResult } from '../provider-health.types';

export interface CheckRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

export interface CheckOutcome {
  ok: boolean;
  message?: string;
}

export abstract class BaseHttpHealthChecker implements ProviderHealthChecker {
  abstract readonly provider: string;
  abstract check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult>;

  protected async perform(
    request: CheckRequest,
    signal: AbortSignal,
    interpret: (res: Response) => Promise<CheckOutcome> | CheckOutcome = defaultInterpret,
  ): Promise<ProviderHealthResult> {
    const started = Date.now();
    try {
      const res = await fetch(request.url, {
        method: request.method ?? 'GET',
        headers: request.headers,
        body: request.body,
        signal,
      });
      const outcome = await interpret(res);
      return { ...outcome, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: networkErrorMessage(err), latencyMs: Date.now() - started };
    }
  }
}

async function defaultInterpret(res: Response): Promise<CheckOutcome> {
  if (res.ok) return { ok: true };
  return { ok: false, message: `${res.status} ${await extractErrorMessage(res)}` };
}

export async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText || 'Provider error';
    try {
      const body = JSON.parse(text) as unknown;
      if (body && typeof body === 'object') {
        const err = (body as { error?: unknown }).error;
        if (
          err &&
          typeof err === 'object' &&
          typeof (err as { message?: unknown }).message === 'string'
        ) {
          return (err as { message: string }).message;
        }
        if (typeof (body as { error?: unknown }).error === 'string') {
          return (body as { error: string }).error;
        }
        if (typeof (body as { message?: unknown }).message === 'string') {
          return (body as { message: string }).message;
        }
      }
    } catch {
      return text.slice(0, 200);
    }
    return res.statusText || 'Provider error';
  } catch {
    return res.statusText || 'Provider error';
  }
}

function networkErrorMessage(err: unknown): string {
  if (isAbortLike(err)) return 'Request timeout';
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return `Network error: ${(err as { message: string }).message}`;
  }
  return 'Network error';
}

function isAbortLike(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; message?: unknown; cause?: unknown };
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  if (typeof e.message === 'string' && /abort|timeout/i.test(e.message)) return true;
  if (e.cause) return isAbortLike(e.cause);
  return false;
}
