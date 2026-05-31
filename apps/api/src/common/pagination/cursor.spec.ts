import { BadRequestException } from '@nestjs/common';
import { decodeKeysetCursor, encodeKeysetCursor, type KeysetCursor } from './cursor';

describe('keyset cursor', () => {
  it('round-trips a string sort value', () => {
    const c: KeysetCursor = { v: 'Zebra', id: 'id-1' };
    expect(decodeKeysetCursor(encodeKeysetCursor(c))).toEqual(c);
  });

  it('round-trips a numeric sort value', () => {
    const c: KeysetCursor = { v: 42, id: 'id-2' };
    expect(decodeKeysetCursor(encodeKeysetCursor(c))).toEqual(c);
  });

  it('round-trips an ISO-date sort value', () => {
    const c: KeysetCursor = { v: new Date('2026-05-30T00:00:00.000Z').toISOString(), id: 'id-3' };
    expect(decodeKeysetCursor(encodeKeysetCursor(c))).toEqual(c);
  });

  it('produces a url-safe (base64url) token', () => {
    const token = encodeKeysetCursor({ v: 'a/b+c=', id: 'x' });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['empty', ''],
    ['non-base64url', 'not base64!!'],
    ['oversized', 'A'.repeat(513)],
    ['valid base64url but not json', Buffer.from('nope', 'utf8').toString('base64url')],
    ['missing id', Buffer.from(JSON.stringify({ v: 'a' }), 'utf8').toString('base64url')],
    ['missing v', Buffer.from(JSON.stringify({ id: 'a' }), 'utf8').toString('base64url')],
    ['empty id', Buffer.from(JSON.stringify({ v: 'a', id: '' }), 'utf8').toString('base64url')],
    [
      'wrong v type',
      Buffer.from(JSON.stringify({ v: { nested: 1 }, id: 'a' }), 'utf8').toString('base64url'),
    ],
  ])('rejects an invalid cursor (%s)', (_label, raw) => {
    expect(() => decodeKeysetCursor(raw)).toThrow(BadRequestException);
  });
});
