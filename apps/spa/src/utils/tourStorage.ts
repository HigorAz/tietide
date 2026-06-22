export const TOUR_COMPLETED_KEY_PREFIX = 'tietide-tour-completed-';

export const tourCompletedKey = (userId: string): string => `${TOUR_COMPLETED_KEY_PREFIX}${userId}`;

export const isTourCompleted = (userId: string): boolean => {
  if (!userId) return false;
  try {
    return localStorage.getItem(tourCompletedKey(userId)) !== null;
  } catch {
    return false;
  }
};

export const markTourCompleted = (userId: string): void => {
  if (!userId) return;
  try {
    localStorage.setItem(tourCompletedKey(userId), '1');
  } catch {
    // Storage unavailable / quota exhausted — degrade silently. Matches the
    // pattern used in Sidebar's collapse persistence.
  }
};

// Generic per-user onboarding flags. Namespaced separately from the legacy
// `tietide-tour-completed-` prefix so the original first-access flag keeps its
// exact key shape (back-compat) while new flags share one read/write helper.
export const ONBOARDING_FLAG_PREFIX = 'tietide-onboarding-';

const flagKey = (flag: string, userId: string): string =>
  `${ONBOARDING_FLAG_PREFIX}${flag}-${userId}`;

const readFlag = (flag: string, userId: string): boolean => {
  if (!userId) return false;
  try {
    return localStorage.getItem(flagKey(flag, userId)) !== null;
  } catch {
    return false;
  }
};

const writeFlag = (flag: string, userId: string): void => {
  if (!userId) return;
  try {
    localStorage.setItem(flagKey(flag, userId), '1');
  } catch {
    // Storage unavailable / quota exhausted — degrade silently.
  }
};

export const isWelcomeSeen = (userId: string): boolean => readFlag('welcome-seen', userId);
export const markWelcomeSeen = (userId: string): void => writeFlag('welcome-seen', userId);

export const isTourSeen = (userId: string, tourId: string): boolean =>
  readFlag(`tour-seen-${tourId}`, userId);
export const markTourSeen = (userId: string, tourId: string): void =>
  writeFlag(`tour-seen-${tourId}`, userId);

export const isChecklistDismissed = (userId: string): boolean =>
  readFlag('checklist-dismissed', userId);
export const markChecklistDismissed = (userId: string): void =>
  writeFlag('checklist-dismissed', userId);

export const isLibraryVisited = (userId: string): boolean => readFlag('library-visited', userId);
export const markLibraryVisited = (userId: string): void => writeFlag('library-visited', userId);

// Wipe every onboarding marker for one user so "Restart onboarding" replays the
// full first-run experience (welcome screen, getting-started checklist, and the
// per-route auto-tours), not just the parts that were never seen. Scans storage
// by key prefix/suffix rather than enumerating tour ids, so it stays in sync as
// tours are added and never reaches across to another user's keys.
export const resetOnboarding = (userId: string): void => {
  if (!userId) return;
  try {
    const completedKey = tourCompletedKey(userId);
    const suffix = `-${userId}`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === completedKey) {
        toRemove.push(key);
      } else if (key.startsWith(ONBOARDING_FLAG_PREFIX) && key.endsWith(suffix)) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable — degrade silently.
  }
};
