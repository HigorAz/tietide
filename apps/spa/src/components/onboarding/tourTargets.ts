// Single source of truth for the tour-target attributes wired into the layout
// + editor JSX. Tests assert that the expected `data-tour` attributes render,
// keeping joyride selectors and DOM in lockstep.

export const TOUR_TARGET_ATTR = 'data-tour';

export const TOUR_TARGET = {
  sidebar: 'sidebar',
  workflowsNav: 'nav-workflows',
  libraryNav: 'nav-library',
  editorCanvas: 'editor-canvas',
  editorRun: 'editor-run',
  editorTest: 'editor-test',
} as const;

export type TourTargetName = (typeof TOUR_TARGET)[keyof typeof TOUR_TARGET];

export const tourSelector = (name: TourTargetName): string => `[${TOUR_TARGET_ATTR}="${name}"]`;
