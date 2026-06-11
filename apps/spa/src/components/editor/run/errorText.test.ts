import { describe, it, expect } from 'vitest';
import { findTemplatePaths, deriveHint } from './errorText';

describe('errorText', () => {
  describe('findTemplatePaths', () => {
    it('should highlight the dotted path in a template-path-not-found message', () => {
      const spans = findTemplatePaths('Template path not found: steps.code.count');
      expect(spans).toHaveLength(1);
      const [span] = spans;
      expect(span.text).toBe('steps.code.count');
      expect('Template path not found: steps.code.count'.slice(span.start, span.end)).toBe(
        'steps.code.count',
      );
    });

    it('should detect bare paths rooted at trigger with array indexes', () => {
      const spans = findTemplatePaths('failed at trigger.messages[0].id');
      expect(spans).toHaveLength(1);
      expect(spans[0].text).toBe('trigger.messages[0].id');
    });

    it('should detect full {{...}} tokens', () => {
      const spans = findTemplatePaths('cannot resolve {{steps.http.body}}');
      expect(spans).toHaveLength(1);
      expect(spans[0].text).toBe('{{steps.http.body}}');
    });

    it('should return [] when there is no path', () => {
      expect(findTemplatePaths('Some unknown failure')).toEqual([]);
    });

    it('should return non-overlapping spans sorted by start', () => {
      const spans = findTemplatePaths('steps.a.b and trigger.c[1] both failed');
      expect(spans.map((s) => s.text)).toEqual(['steps.a.b', 'trigger.c[1]']);
      expect(spans[0].start).toBeLessThan(spans[1].start);
      expect(spans[0].end).toBeLessThanOrEqual(spans[1].start);
    });
  });

  describe('deriveHint', () => {
    it('should return the template-path hint for a path-not-found message', () => {
      expect(deriveHint('Template path not found: steps.code.count')).toMatch(
        /upstream node didn't expose that field/i,
      );
    });

    it('should return the env-var hint', () => {
      expect(deriveHint('Env var MY_KEY not found in user or global scope')).toMatch(
        /environment variable isn't defined/i,
      );
    });

    it('should return the timeout hint', () => {
      expect(deriveHint('Request timed out after 30s')).toMatch(/didn't answer in time/i);
    });

    it('should return the auth hint for a 401', () => {
      expect(deriveHint('Request failed with status 401 Unauthorized')).toMatch(
        /credentials look invalid/i,
      );
    });

    it('should return null for an unrecognized message', () => {
      expect(deriveHint('Some unknown failure')).toBeNull();
    });
  });
});
