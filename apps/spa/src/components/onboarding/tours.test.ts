import { describe, it, expect } from 'vitest';
import {
  getTour,
  getTourSteps,
  getTourIdForRoute,
  hasTourForRoute,
  TOURS,
  TOUR_ID,
  TOUR_ORDER,
  EDITOR_TOUR_STEPS,
  FIRST_ACCESS_STEPS,
  FIRST_ACCESS_EDITOR_START,
} from './tours';
import { tourSelector, TOUR_TARGET } from './tourTargets';

describe('tours', () => {
  describe('registry', () => {
    it('should define a tour for every TourId with at least one step', () => {
      for (const id of Object.values(TOUR_ID)) {
        expect(TOURS[id]).toBeDefined();
        expect(TOURS[id].steps.length).toBeGreaterThan(0);
        expect(TOURS[id].label).toBeTruthy();
      }
    });

    it('should list every tour exactly once in TOUR_ORDER', () => {
      expect([...TOUR_ORDER].sort()).toEqual([...Object.values(TOUR_ID)].sort());
    });

    it('every step should carry a target and content', () => {
      for (const id of Object.values(TOUR_ID)) {
        for (const step of TOURS[id].steps) {
          expect(step.target).toBeTruthy();
          expect(step.content).toBeTruthy();
        }
      }
    });
  });

  describe('getTourIdForRoute', () => {
    it.each([
      ['/', TOUR_ID.home],
      ['/dashboard', TOUR_ID.dashboard],
      ['/workflows', TOUR_ID.workflows],
      ['/workflows/abc-123', TOUR_ID.editor],
      ['/connections', TOUR_ID.connections],
      ['/library', TOUR_ID.library],
      ['/history', TOUR_ID.history],
    ])('should map %s to the %s tour', (route, expected) => {
      expect(getTourIdForRoute(route)).toBe(expected);
    });

    it('should return null for routes without a tour', () => {
      expect(getTourIdForRoute('/settings')).toBeNull();
      expect(getTourIdForRoute('/workspace-settings')).toBeNull();
    });
  });

  describe('getTourSteps / hasTourForRoute', () => {
    it('should return the editor steps for an editor route', () => {
      expect(getTourSteps('/workflows/abc-123')).toBe(EDITOR_TOUR_STEPS);
      expect(hasTourForRoute('/workflows/abc-123')).toBe(true);
    });

    it('should return an empty array (and false) for routes without a tour', () => {
      expect(getTourSteps('/settings')).toEqual([]);
      expect(hasTourForRoute('/settings')).toBe(false);
    });
  });

  describe('getTour', () => {
    it('should resolve a definition by id', () => {
      expect(getTour(TOUR_ID.connections).id).toBe('connections');
    });
  });

  describe('EDITOR_TOUR_STEPS', () => {
    it('should anchor on the node library, canvas, run and test targets', () => {
      const targets = EDITOR_TOUR_STEPS.map((s) => s.target);
      expect(targets).toContain(tourSelector(TOUR_TARGET.editorNodeLibrary));
      expect(targets).toContain(tourSelector(TOUR_TARGET.editorCanvas));
      expect(targets).toContain(tourSelector(TOUR_TARGET.editorRun));
      expect(targets).toContain(tourSelector(TOUR_TARGET.editorTest));
    });

    it('should teach the stepped panel, data pills, and reading results', () => {
      const text = EDITOR_TOUR_STEPS.map((s) => String(s.content)).join(' ');
      expect(text).toMatch(/Connection/);
      expect(text).toMatch(/Configure/);
      expect(text).toMatch(/data pill/i);
      expect(text).toMatch(/tree or table/i);
    });

    it('should warn that side effects fire on Test by default', () => {
      const testStep = EDITOR_TOUR_STEPS.find(
        (s) => s.target === tourSelector(TOUR_TARGET.editorTest),
      );
      const content = String(testStep?.content ?? '');
      expect(content).toMatch(/side effect/i);
      expect(content).toMatch(/mockOnDryRun/);
    });

    it('should center concept steps that have no stable anchor', () => {
      const centered = EDITOR_TOUR_STEPS.filter((s) => s.placement === 'center');
      expect(centered.length).toBeGreaterThan(0);
      for (const step of centered) expect(step.target).toBe('body');
    });
  });

  describe('first-access sequence', () => {
    it('should walk every main page before the editor, each step routed', () => {
      const pageSteps = FIRST_ACCESS_STEPS.slice(0, FIRST_ACCESS_EDITOR_START);
      expect(pageSteps.length).toBeGreaterThan(0);
      for (const step of pageSteps) expect(step.route).toBeTruthy();
      expect(new Set(pageSteps.map((s) => s.route))).toEqual(
        new Set(['/', '/workflows', '/connections', '/library', '/history', '/dashboard']),
      );
    });

    it('should start on home anchored to the always-mounted sidebar', () => {
      expect(FIRST_ACCESS_STEPS[0].route).toBe('/');
      expect(FIRST_ACCESS_STEPS[0].target).toBe(tourSelector(TOUR_TARGET.sidebar));
    });

    it('should transition into the editor right after the page lap', () => {
      expect(FIRST_ACCESS_EDITOR_START).toBe(FIRST_ACCESS_STEPS.filter((s) => s.route).length);
    });

    it('should anchor every editor step to a real element (no centered cards)', () => {
      const editorSteps = FIRST_ACCESS_STEPS.slice(FIRST_ACCESS_EDITOR_START);
      expect(editorSteps.length).toBeGreaterThan(0);
      for (const step of editorSteps) {
        expect(step.target).not.toBe('body');
        expect(step.route).toBeUndefined();
      }
    });

    it('should reveal the config panel by selecting a seeded node', () => {
      const configSteps = FIRST_ACCESS_STEPS.slice(FIRST_ACCESS_EDITOR_START).filter(
        (s) => s.target === tourSelector(TOUR_TARGET.editorConfigPanel),
      );
      expect(configSteps.length).toBeGreaterThan(0);
      for (const step of configSteps) expect(step.selectNodeId).toBeTruthy();
    });
  });
});
