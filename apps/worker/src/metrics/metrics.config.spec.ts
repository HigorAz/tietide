import { DEFAULT_METRICS_PORT, resolveMetricsPort } from './metrics.config';

describe('resolveMetricsPort', () => {
  it('defaults when unset/empty/invalid', () => {
    expect(resolveMetricsPort(undefined)).toBe(DEFAULT_METRICS_PORT);
    expect(resolveMetricsPort('')).toBe(DEFAULT_METRICS_PORT);
    expect(resolveMetricsPort('abc')).toBe(DEFAULT_METRICS_PORT);
  });

  it('defaults on out-of-range ports', () => {
    expect(resolveMetricsPort('0')).toBe(DEFAULT_METRICS_PORT);
    expect(resolveMetricsPort('70000')).toBe(DEFAULT_METRICS_PORT);
    expect(resolveMetricsPort('-1')).toBe(DEFAULT_METRICS_PORT);
  });

  it('accepts a valid port', () => {
    expect(resolveMetricsPort('9100')).toBe(9100);
    expect(resolveMetricsPort(3000)).toBe(3000);
  });
});
