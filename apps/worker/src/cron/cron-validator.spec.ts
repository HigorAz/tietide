import { isValidCron } from './cron-validator';

describe('isValidCron', () => {
  describe('valid expressions', () => {
    it('should accept five-star wildcard "* * * * *"', () => {
      expect(isValidCron('* * * * *')).toBe(true);
    });

    it('should accept numeric expression "0 9 * * 1"', () => {
      expect(isValidCron('0 9 * * 1')).toBe(true);
    });

    it('should accept step expression "*/5 * * * *"', () => {
      expect(isValidCron('*/5 * * * *')).toBe(true);
    });

    it('should accept range expression "0-30 * * * *"', () => {
      expect(isValidCron('0-30 * * * *')).toBe(true);
    });

    it('should accept comma list "0,15,30,45 * * * *"', () => {
      expect(isValidCron('0,15,30,45 * * * *')).toBe(true);
    });

    it('should accept mixed "0 9-17 * * 1-5"', () => {
      expect(isValidCron('0 9-17 * * 1-5')).toBe(true);
    });

    it('should tolerate surrounding whitespace', () => {
      expect(isValidCron('  * * * * *  ')).toBe(true);
    });
  });

  describe('invalid expressions', () => {
    it('should reject empty string', () => {
      expect(isValidCron('')).toBe(false);
    });

    it('should reject expression with only four fields', () => {
      expect(isValidCron('* * * *')).toBe(false);
    });

    it('should reject expression with six fields', () => {
      expect(isValidCron('* * * * * *')).toBe(false);
    });

    it('should reject expression with non-cron characters', () => {
      expect(isValidCron('not-a-cron-expression')).toBe(false);
    });

    it('should reject letters in fields', () => {
      expect(isValidCron('A * * * *')).toBe(false);
    });

    it('should reject standalone slash without step', () => {
      expect(isValidCron('/ * * * *')).toBe(false);
    });

    it('should reject expression with shell metacharacters', () => {
      expect(isValidCron('* * * * * ; rm -rf /')).toBe(false);
    });
  });
});
