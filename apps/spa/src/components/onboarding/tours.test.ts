import { describe, it, expect } from 'vitest';
import {
  getTourSteps,
  hasTourForRoute,
  FIRST_ACCESS_STEPS,
  DASHBOARD_TOUR_STEPS,
  EDITOR_TOUR_STEPS,
} from './tours';
import { tourSelector, TOUR_TARGET } from './tourTargets';

describe('tours', () => {
  describe('DASHBOARD_TOUR_STEPS', () => {
    it('should expose 3 steps (sidebar, workflows nav, library nav)', () => {
      expect(DASHBOARD_TOUR_STEPS).toHaveLength(3);
    });

    it('should target the sidebar, workflows nav, and library nav by data-tour selectors', () => {
      const targets = DASHBOARD_TOUR_STEPS.map((step) => step.target);
      expect(targets).toEqual([
        tourSelector(TOUR_TARGET.sidebar),
        tourSelector(TOUR_TARGET.workflowsNav),
        tourSelector(TOUR_TARGET.libraryNav),
      ]);
    });
  });

  describe('EDITOR_TOUR_STEPS', () => {
    it('should expose 2 steps (canvas, run)', () => {
      expect(EDITOR_TOUR_STEPS).toHaveLength(2);
    });

    it('should target the editor canvas and the run button', () => {
      const targets = EDITOR_TOUR_STEPS.map((step) => step.target);
      expect(targets).toEqual([
        tourSelector(TOUR_TARGET.editorCanvas),
        tourSelector(TOUR_TARGET.editorRun),
      ]);
    });
  });

  describe('FIRST_ACCESS_STEPS', () => {
    it('should be the 5 onboarding steps from the issue (3 dashboard + 2 editor)', () => {
      expect(FIRST_ACCESS_STEPS).toHaveLength(5);
      expect(FIRST_ACCESS_STEPS).toEqual([...DASHBOARD_TOUR_STEPS, ...EDITOR_TOUR_STEPS]);
    });
  });

  describe('getTourSteps', () => {
    it('should return the dashboard tour for /dashboard', () => {
      expect(getTourSteps('/dashboard')).toEqual(DASHBOARD_TOUR_STEPS);
    });

    it('should return the editor tour for /workflows/:id', () => {
      expect(getTourSteps('/workflows/abc-123')).toEqual(EDITOR_TOUR_STEPS);
    });

    it('should return an empty array for routes without a tour (e.g. /settings)', () => {
      expect(getTourSteps('/settings')).toEqual([]);
    });

    it('should return an empty array for the bare /workflows index (no canvas yet)', () => {
      expect(getTourSteps('/workflows')).toEqual([]);
    });
  });

  describe('hasTourForRoute', () => {
    it('should be true for routes that have a tour', () => {
      expect(hasTourForRoute('/dashboard')).toBe(true);
      expect(hasTourForRoute('/workflows/x')).toBe(true);
    });

    it('should be false for routes without a tour', () => {
      expect(hasTourForRoute('/settings')).toBe(false);
      expect(hasTourForRoute('/workflows')).toBe(false);
    });
  });
});
