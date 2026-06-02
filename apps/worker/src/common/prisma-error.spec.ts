import { isUniqueViolation } from './prisma-error';

describe('isUniqueViolation', () => {
  it('returns true for a Prisma P2002 unique-constraint error shape', () => {
    expect(isUniqueViolation(Object.assign(new Error('Unique failed'), { code: 'P2002' }))).toBe(
      true,
    );
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
  });

  it('returns false for other Prisma error codes', () => {
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error('connection reset'), { code: 'P1001' }))).toBe(
      false,
    );
  });

  it('returns false for non-error / codeless values', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
    expect(isUniqueViolation(new Error('plain'))).toBe(false);
  });
});
