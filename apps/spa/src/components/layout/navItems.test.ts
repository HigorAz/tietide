import { describe, it, expect } from 'vitest';
import { navItems, visibleNavItems } from './navItems';
import { TOUR_TARGET } from '@/components/onboarding/tourTargets';

describe('navItems', () => {
  // The tour targets here are hand-written string literals that the onboarding
  // tours resolve via TOUR_TARGET constants. This lockstep test fails if a nav
  // anchor is renamed on one side only (a silently broken tour step).
  it('wires every nav tourTarget to a known TOUR_TARGET constant', () => {
    const known = new Set<string>(Object.values(TOUR_TARGET));
    for (const item of navItems) {
      if (item.tourTarget) {
        expect(known.has(item.tourTarget), `${item.label} → ${item.tourTarget}`).toBe(true);
      }
    }
  });

  it('anchors the nav items the tours rely on', () => {
    const byPath = new Map(navItems.map((i) => [i.to, i.tourTarget]));
    expect(byPath.get('/')).toBe(TOUR_TARGET.homeNav);
    expect(byPath.get('/dashboard')).toBe(TOUR_TARGET.dashboardNav);
    expect(byPath.get('/workflows')).toBe(TOUR_TARGET.workflowsNav);
    expect(byPath.get('/history')).toBe(TOUR_TARGET.historyNav);
    expect(byPath.get('/library')).toBe(TOUR_TARGET.libraryNav);
    expect(byPath.get('/connections')).toBe(TOUR_TARGET.connectionsNav);
  });

  it('keeps admin-only items hidden from non-admins', () => {
    const userItems = visibleNavItems('USER');
    expect(userItems.some((i) => i.requiredRole === 'ADMIN')).toBe(false);
  });
});
