import { describe, it, expect } from 'vitest';
import { connectionSummary, configureSummary } from './stepSummaries';

describe('stepSummaries', () => {
  describe('connectionSummary', () => {
    it('should render "name · status" (status lowercased) for a selected connection', () => {
      expect(
        connectionSummary(
          { name: 'My Google', status: 'ACTIVE' },
          { optional: false, stale: false },
        ),
      ).toBe('My Google · active');
    });

    it('should render "No authentication" for an optional connection with nothing selected', () => {
      expect(connectionSummary(null, { optional: true, stale: false })).toBe('No authentication');
    });

    it('should render "Connection unavailable" when the saved id is stale (unresolved)', () => {
      expect(connectionSummary(null, { optional: false, stale: true })).toBe(
        'Connection unavailable',
      );
    });

    it('should render "Connection unavailable" when stale even for an optional step', () => {
      expect(connectionSummary(null, { optional: true, stale: true })).toBe(
        'Connection unavailable',
      );
    });

    it('should render "Choose a connection" for a required connection with nothing selected', () => {
      expect(connectionSummary(null, { optional: false, stale: false })).toBe(
        'Choose a connection',
      );
    });
  });

  describe('configureSummary', () => {
    it('should count configured fields excluding internal keys', () => {
      expect(
        configureSummary({
          query: 'x',
          maxResults: 10,
          connectionId: 'c',
          hasErrorHandler: true,
          mockOnDryRun: false,
          __pillSample: {},
        }),
      ).toBe('2 fields configured');
    });

    it('should pluralize correctly for a single field', () => {
      expect(configureSummary({ query: 'x' })).toBe('1 field configured');
    });

    it('should render "Using defaults" when no countable fields are set', () => {
      expect(configureSummary({})).toBe('Using defaults');
    });

    it('should treat empty strings and null/undefined as not configured', () => {
      expect(configureSummary({ a: '', b: null, c: undefined })).toBe('Using defaults');
    });

    it('should count zero and false as configured values (defined, non-empty)', () => {
      // `false` boolean is a meaningful set value; only the excluded toggle keys are ignored.
      expect(configureSummary({ count: 0, flag: false })).toBe('2 fields configured');
    });
  });
});
