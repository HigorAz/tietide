import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  tourCompletedKey,
  isTourCompleted,
  markTourCompleted,
  TOUR_COMPLETED_KEY_PREFIX,
} from './tourStorage';

describe('tourStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('tourCompletedKey', () => {
    it('should produce the AC-required key shape `tietide-tour-completed-{userId}`', () => {
      expect(tourCompletedKey('abc-123')).toBe('tietide-tour-completed-abc-123');
    });

    it('should expose a stable prefix constant for callers that scan storage', () => {
      expect(TOUR_COMPLETED_KEY_PREFIX).toBe('tietide-tour-completed-');
    });
  });

  describe('isTourCompleted', () => {
    it('should return false when no flag is stored', () => {
      expect(isTourCompleted('user-1')).toBe(false);
    });

    it('should return true when a flag is stored for that userId', () => {
      localStorage.setItem(tourCompletedKey('user-1'), '1');
      expect(isTourCompleted('user-1')).toBe(true);
    });

    it('should not leak completion across different userIds', () => {
      localStorage.setItem(tourCompletedKey('user-1'), '1');
      expect(isTourCompleted('user-2')).toBe(false);
    });

    it('should treat an empty userId as not-completed (defensive — never persist for empty)', () => {
      expect(isTourCompleted('')).toBe(false);
    });
  });

  describe('markTourCompleted', () => {
    it('should write the flag under the expected key', () => {
      markTourCompleted('user-1');
      expect(localStorage.getItem(tourCompletedKey('user-1'))).not.toBeNull();
      expect(isTourCompleted('user-1')).toBe(true);
    });

    it('should be a no-op for an empty userId (avoid polluting the prefix namespace)', () => {
      markTourCompleted('');
      expect(localStorage.getItem(`${TOUR_COMPLETED_KEY_PREFIX}`)).toBeNull();
    });

    describe('when localStorage is unavailable', () => {
      let setItemSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('quota exceeded');
        });
      });

      afterEach(() => {
        setItemSpy.mockRestore();
      });

      it('should swallow the error and not throw (matches existing Sidebar pattern)', () => {
        expect(() => markTourCompleted('user-1')).not.toThrow();
      });
    });
  });
});
