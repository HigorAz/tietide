import { useEffect, useState } from 'react';

const getMatch = (query: string): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
};

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 * SSR/jsdom-safe: returns `false` when `window.matchMedia` is unavailable.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => getMatch(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia(query);
    // Sync immediately in case the query changed between render and effect.
    setMatches(mql.matches);

    const handler = (event: MediaQueryListEvent): void => setMatches(event.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback.
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);

  return matches;
}

const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * True on phones and tablets in portrait (< 768px, Tailwind's `md` cut).
 * The desktop layout renders at >= 768px.
 */
export function useIsMobile(): boolean {
  return !useMediaQuery(DESKTOP_QUERY);
}
