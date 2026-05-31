import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  resolveRetentionDays,
} from './retention.config';

describe('resolveRetentionDays', () => {
  it('defaults when unset', () => {
    expect(resolveRetentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays('')).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('defaults on invalid / non-integer / sub-1 values', () => {
    expect(resolveRetentionDays('abc')).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays('0')).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays('-5')).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays('1.5')).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('passes a valid value through', () => {
    expect(resolveRetentionDays('30')).toBe(30);
    expect(resolveRetentionDays(180)).toBe(180);
  });

  it('clamps to the maximum', () => {
    expect(resolveRetentionDays('999999')).toBe(MAX_RETENTION_DAYS);
  });
});
