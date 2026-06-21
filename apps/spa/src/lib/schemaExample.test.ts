import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToExample } from './schemaExample';

describe('zodToExample', () => {
  it('walks an object into a nested placeholder object', () => {
    const schema = z.object({ id: z.string(), count: z.number(), ok: z.boolean() });
    expect(zodToExample(schema)).toEqual({
      id: 'example-id',
      count: 1,
      ok: false,
    });
  });

  it('produces one element for an array', () => {
    const schema = z.object({ items: z.array(z.object({ name: z.string() })) });
    expect(zodToExample(schema)).toEqual({ items: [{ name: 'Example name' }] });
  });

  it('includes optional and nullable fields', () => {
    const schema = z.object({
      maybe: z.string().optional(),
      nullable: z.number().nullable(),
    });
    expect(zodToExample(schema)).toEqual({ maybe: 'example', nullable: 0 });
  });

  it('uses the first value of an enum', () => {
    const schema = z.object({ state: z.enum(['open', 'closed']) });
    expect(zodToExample(schema)).toEqual({ state: 'open' });
  });

  it('picks the first option of a union', () => {
    const schema = z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]);
    expect(zodToExample(schema)).toEqual({ a: 'example' });
  });

  it('resolves a discriminated union to its first branch', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('text'), value: z.string() }),
      z.object({ kind: z.literal('num'), value: z.number() }),
    ]);
    expect(zodToExample(schema)).toEqual({ kind: 'text', value: 'example' });
  });

  it('derives contextual string placeholders from the field key', () => {
    const schema = z.object({
      email: z.string(),
      webViewLink: z.string(),
      messageId: z.string(),
      createdAt: z.string(),
      subject: z.string(),
    });
    expect(zodToExample(schema)).toEqual({
      email: 'user@example.com',
      webViewLink: 'https://example.com',
      messageId: 'example-id',
      createdAt: '2026-01-01T12:00:00.000Z',
      subject: 'Example subject',
    });
  });

  it('collapses a record/unknown to an empty object / null', () => {
    expect(zodToExample(z.record(z.unknown()))).toEqual({});
    expect(zodToExample(z.unknown())).toBeNull();
    expect(zodToExample(z.any())).toBeNull();
  });

  it('honors a literal value', () => {
    const schema = z.object({ action: z.literal('opened') });
    expect(zodToExample(schema)).toEqual({ action: 'opened' });
  });

  it('uses a default value when one is declared', () => {
    const schema = z.object({ retries: z.number().default(3) });
    expect(zodToExample(schema)).toEqual({ retries: 3 });
  });

  it('does not throw on deeply nested / self-referential lazy schemas', () => {
    const lazy: z.ZodTypeAny = z.lazy(() => z.object({ child: lazy.optional() }));
    expect(() => zodToExample(lazy)).not.toThrow();
  });

  it('produces a serializable value for an unrecognized type (defensive null)', () => {
    // z.never() / exotic types collapse to null rather than throwing.
    expect(zodToExample(z.never())).toBeNull();
  });
});
