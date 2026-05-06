import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('should round-trip a {createdAt, id} pair', () => {
      const original = {
        createdAt: new Date('2026-04-20T10:00:00.123Z'),
        id: '11111111-1111-4111-8111-111111111111',
      };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);
      expect(decoded.id).toBe(original.id);
      expect(decoded.createdAt.toISOString()).toBe(original.createdAt.toISOString());
    });

    it('should produce an opaque base64url string with no JSON characters', () => {
      const encoded = encodeCursor({
        createdAt: new Date('2026-04-20T10:00:00Z'),
        id: 'some-id',
      });
      expect(encoded).not.toMatch(/[{}":]/);
    });
  });

  describe('decodeCursor', () => {
    it('should throw BadRequestException for empty input', () => {
      expect(() => decodeCursor('')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-base64url characters', () => {
      expect(() => decodeCursor('not valid base64!@#')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for input over 256 chars', () => {
      const oversized = 'a'.repeat(257);
      expect(() => decodeCursor(oversized)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when payload is missing fields', () => {
      const partial = Buffer.from(JSON.stringify({ id: 'x' }), 'utf8').toString('base64url');
      expect(() => decodeCursor(partial)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when createdAt is not a valid ISO date', () => {
      const bad = Buffer.from(
        JSON.stringify({ createdAt: 'not-a-date', id: 'x' }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(bad)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when id is empty', () => {
      const bad = Buffer.from(
        JSON.stringify({ createdAt: '2026-04-20T10:00:00Z', id: '' }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(bad)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when JSON is malformed', () => {
      const bad = Buffer.from('not-json', 'utf8').toString('base64url');
      expect(() => decodeCursor(bad)).toThrow(BadRequestException);
    });
  });
});
