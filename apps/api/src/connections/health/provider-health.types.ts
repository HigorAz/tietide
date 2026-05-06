export interface ProviderHealthResult {
  ok: boolean;
  message?: string;
  latencyMs: number;
}

export interface ProviderHealthChecker {
  readonly provider: string;
  check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult>;
}
