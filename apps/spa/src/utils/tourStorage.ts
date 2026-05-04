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
