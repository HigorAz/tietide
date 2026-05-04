import type { ReactNode } from 'react';
import { tourSelector, TOUR_TARGET } from './tourTargets';

// Local step shape that mirrors react-joyride's Step. Kept narrow so this
// module stays decoupled from the joyride type surface — AppTour casts
// these to joyride's Step[] at the boundary.
export interface TourStep {
  target: string;
  content: ReactNode;
  title?: string;
  placement?: 'top' | 'right' | 'bottom' | 'left' | 'auto' | 'center';
  disableBeacon?: boolean;
}

export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    target: tourSelector(TOUR_TARGET.sidebar),
    title: 'Welcome to TieTide',
    content:
      'These are your main areas — navigate to dashboards, workflows, history, library, and connections from here.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: tourSelector(TOUR_TARGET.workflowsNav),
    title: 'Workflows',
    content: 'Create or manage your automations here.',
    placement: 'right',
  },
  {
    target: tourSelector(TOUR_TARGET.libraryNav),
    title: 'Library',
    content: 'Pre-built templates to get started fast.',
    placement: 'right',
  },
];

export const EDITOR_TOUR_STEPS: TourStep[] = [
  {
    target: tourSelector(TOUR_TARGET.editorCanvas),
    title: 'Editor canvas',
    content: 'Drag nodes from the left, connect them, and save.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: tourSelector(TOUR_TARGET.editorRun),
    title: 'Run',
    content: 'Click to execute and watch the live results.',
    placement: 'bottom',
  },
];

export const FIRST_ACCESS_STEPS: TourStep[] = [...DASHBOARD_TOUR_STEPS, ...EDITOR_TOUR_STEPS];

const isEditorRoute = (pathname: string): boolean => /^\/workflows\/[^/]+/.test(pathname);

export const getTourSteps = (pathname: string): TourStep[] => {
  if (pathname === '/dashboard') return DASHBOARD_TOUR_STEPS;
  if (isEditorRoute(pathname)) return EDITOR_TOUR_STEPS;
  return [];
};

export const hasTourForRoute = (pathname: string): boolean => getTourSteps(pathname).length > 0;
