// Single source of truth for the tour-target attributes wired into the layout
// + editor JSX. Tests assert that the expected `data-tour` attributes render,
// keeping joyride selectors and DOM in lockstep.

export const TOUR_TARGET_ATTR = 'data-tour';

export const TOUR_TARGET = {
  // Layout / navigation (always mounted in the shell)
  sidebar: 'sidebar',
  homeNav: 'nav-home',
  dashboardNav: 'nav-dashboard',
  workflowsNav: 'nav-workflows',
  historyNav: 'nav-history',
  libraryNav: 'nav-library',
  connectionsNav: 'nav-connections',

  // Home
  homeQuickActions: 'home-quick-actions',
  gettingStarted: 'getting-started',
  homeRecentActivity: 'home-recent-activity',

  // Dashboard
  dashboardRange: 'dashboard-range',
  dashboardSummary: 'dashboard-summary',
  dashboardCharts: 'dashboard-charts',
  dashboardConnectionHealth: 'dashboard-connection-health',

  // Workflows list
  workflowsNew: 'workflows-new',
  workflowsImport: 'workflows-import',
  workflowsFolders: 'workflows-folders',
  workflowsTags: 'workflows-tags',
  workflowsList: 'workflows-list',

  // Editor (anchored targets are always present; concept steps are centered)
  editorNodeLibrary: 'editor-node-library',
  editorCanvas: 'editor-canvas',
  editorConfigPanel: 'editor-config-panel',
  editorViewTabs: 'editor-view-tabs',
  editorInspector: 'editor-inspector',
  editorSave: 'editor-save',
  editorDocs: 'editor-docs',
  editorRun: 'editor-run',
  editorTest: 'editor-test',

  // Connections
  connectionsTabs: 'connections-tabs',
  connectionsProviderPicker: 'connections-provider-picker',

  // Library
  librarySearch: 'library-search',
  libraryGrid: 'library-grid',

  // History
  historyFilters: 'history-filters',
  historyList: 'history-list',
} as const;

export type TourTargetName = (typeof TOUR_TARGET)[keyof typeof TOUR_TARGET];

export const tourSelector = (name: TourTargetName): string => `[${TOUR_TARGET_ATTR}="${name}"]`;
