import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  tourCompletedKey,
  isTourCompleted,
  markTourCompleted,
  TOUR_COMPLETED_KEY_PREFIX,
  ONBOARDING_FLAG_PREFIX,
  isWelcomeSeen,
  markWelcomeSeen,
  isTourSeen,
  markTourSeen,
  isChecklistDismissed,
  markChecklistDismissed,
  isLibraryVisited,
  markLibraryVisited,
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

  describe('onboarding flags (generic per-user namespace)', () => {
    it('should expose a stable prefix distinct from the legacy tour-completed prefix', () => {
      expect(ONBOARDING_FLAG_PREFIX).toBe('tietide-onboarding-');
      expect(ONBOARDING_FLAG_PREFIX).not.toBe(TOUR_COMPLETED_KEY_PREFIX);
    });

    describe('welcome-seen', () => {
      it('should be false before the welcome modal has been seen', () => {
        expect(isWelcomeSeen('user-1')).toBe(false);
      });

      it('should be true after marking it seen for that user', () => {
        markWelcomeSeen('user-1');
        expect(isWelcomeSeen('user-1')).toBe(true);
      });

      it('should not leak across users', () => {
        markWelcomeSeen('user-1');
        expect(isWelcomeSeen('user-2')).toBe(false);
      });

      it('should treat an empty userId as not-seen and never persist for it', () => {
        markWelcomeSeen('');
        expect(isWelcomeSeen('')).toBe(false);
      });
    });

    describe('per-tour seen', () => {
      it('should track seen state independently per tourId', () => {
        markTourSeen('user-1', 'editor');
        expect(isTourSeen('user-1', 'editor')).toBe(true);
        expect(isTourSeen('user-1', 'connections')).toBe(false);
      });

      it('should not leak a tour seen-flag across users', () => {
        markTourSeen('user-1', 'editor');
        expect(isTourSeen('user-2', 'editor')).toBe(false);
      });
    });

    describe('checklist-dismissed', () => {
      it('should round-trip the dismissed flag for a user', () => {
        expect(isChecklistDismissed('user-1')).toBe(false);
        markChecklistDismissed('user-1');
        expect(isChecklistDismissed('user-1')).toBe(true);
      });
    });

    describe('library-visited', () => {
      it('should round-trip the visited flag for a user', () => {
        expect(isLibraryVisited('user-1')).toBe(false);
        markLibraryVisited('user-1');
        expect(isLibraryVisited('user-1')).toBe(true);
      });
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

      it('should swallow write errors across all onboarding flags', () => {
        expect(() => {
          markWelcomeSeen('user-1');
          markTourSeen('user-1', 'editor');
          markChecklistDismissed('user-1');
          markLibraryVisited('user-1');
        }).not.toThrow();
      });
    });
  });
});
