import {
  DEFAULT_WORKER_CONCURRENCY,
  MAX_WORKER_CONCURRENCY,
  resolveWorkerConcurrency,
} from './concurrency.config';

describe('resolveWorkerConcurrency', () => {
  it('defaults to DEFAULT_WORKER_CONCURRENCY when WORKER_CONCURRENCY is unset', () => {
    expect(resolveWorkerConcurrency({})).toBe(DEFAULT_WORKER_CONCURRENCY);
  });

  it('defaults when WORKER_CONCURRENCY is blank', () => {
    expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: '   ' })).toBe(
      DEFAULT_WORKER_CONCURRENCY,
    );
  });

  it('parses a valid positive integer', () => {
    expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: '10' })).toBe(10);
  });

  it('falls back to the default on non-numeric values', () => {
    expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: 'lots' })).toBe(
      DEFAULT_WORKER_CONCURRENCY,
    );
  });

  it('falls back to the default on zero or negative values', () => {
    expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: '0' })).toBe(DEFAULT_WORKER_CONCURRENCY);
    expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: '-4' })).toBe(DEFAULT_WORKER_CONCURRENCY);
  });

  it('falls back to the default on a non-integer value', () => {
    expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: '2.5' })).toBe(
      DEFAULT_WORKER_CONCURRENCY,
    );
  });

  it('caps absurdly large values at MAX_WORKER_CONCURRENCY', () => {
    expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: '100000' })).toBe(MAX_WORKER_CONCURRENCY);
  });
});
