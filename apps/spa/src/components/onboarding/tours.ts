import type { ReactNode } from 'react';
import { tourSelector, TOUR_TARGET } from './tourTargets';

// Local step shape that mirrors react-joyride's Step. Kept narrow so this
// module stays decoupled from the joyride type surface — AppTour casts these
// to joyride's Step[] at the boundary.
export interface TourStep {
  target: string;
  content: ReactNode;
  title?: string;
  placement?: 'top' | 'right' | 'bottom' | 'left' | 'auto' | 'center';
  disableBeacon?: boolean;
  /**
   * Static route this step lives on. When set, AppTour navigates here on entry
   * (and the element-ready gate holds the tooltip until the page + target mount),
   * so the multi-page first-access tour shows each area behind its step. Omitted
   * for editor steps, whose route is the dynamic /workflows/:id created at the
   * transition.
   */
  route?: string;
  /**
   * Editor-only: a node id to select on entry so a transient anchor mounts. The
   * node-config panel only renders for a selected node, so the "configure" /
   * "data pills" steps select a node from the seeded sample to reveal it.
   */
  selectNodeId?: string;
}

const anchor = (
  name: (typeof TOUR_TARGET)[keyof typeof TOUR_TARGET],
  step: Omit<TourStep, 'target'>,
): TourStep => ({ target: tourSelector(name), ...step });

// A non-anchored, screen-centered informational step. Used to teach concepts
// that depend on transient UI state (a selected node, an open panel) which may
// not be present when the tour runs — joyride centers these over the page.
const concept = (step: Omit<TourStep, 'target' | 'placement'>): TourStep => ({
  target: 'body',
  placement: 'center',
  ...step,
});

// ---------------------------------------------------------------------------
// Per-route tours
// ---------------------------------------------------------------------------

export const HOME_TOUR_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.sidebar, {
    title: 'Welcome to TieTide',
    content:
      'This is your home base. Use the sidebar to reach your dashboard, workflows, run history, connections, and the template library.',
    placement: 'right',
    disableBeacon: true,
  }),
  anchor(TOUR_TARGET.homeQuickActions, {
    title: 'Quick actions',
    content: 'Jump straight into building — create a workflow or browse ready-made templates.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.gettingStarted, {
    title: 'Getting started',
    content:
      'This checklist tracks your first steps. It ticks off automatically as you build, connect an app, and run your first workflow.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.homeRecentActivity, {
    title: 'Recent activity',
    content: 'Your latest runs land here. Click any one to open it and inspect what happened.',
    placement: 'top',
  }),
];

export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.dashboardRange, {
    title: 'Pick a time range',
    content: 'Switch between the last 7, 30, or 90 days — every metric below updates to match.',
    placement: 'bottom',
    disableBeacon: true,
  }),
  anchor(TOUR_TARGET.dashboardSummary, {
    title: 'Your numbers at a glance',
    content:
      'Total runs, success rate, and average duration — with the change versus the previous period.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.dashboardCharts, {
    title: 'Trends over time',
    content:
      'See runs and errors per day, and how your executions break down by status and trigger.',
    placement: 'top',
  }),
  anchor(TOUR_TARGET.dashboardConnectionHealth, {
    title: 'Connection health',
    content: 'A quick read on which integrations are working and which need a re-auth.',
    placement: 'top',
  }),
];

export const WORKFLOWS_TOUR_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.workflowsNew, {
    title: 'Create a workflow',
    content:
      'Start a blank automation. You can also import one from a JSON file with the button beside it.',
    placement: 'bottom',
    disableBeacon: true,
  }),
  anchor(TOUR_TARGET.workflowsFolders, {
    title: 'Organize with folders',
    content: 'Group related workflows into folders. Drag a workflow onto a folder to move it.',
    placement: 'right',
  }),
  anchor(TOUR_TARGET.workflowsTags, {
    title: 'Filter by tag',
    content: 'Tag workflows and filter the list to find what you need fast.',
    placement: 'right',
  }),
  anchor(TOUR_TARGET.workflowsList, {
    title: 'Your workflows',
    content:
      'Open a workflow to edit it, toggle it active, or use the row menu to duplicate, tag, or generate AI documentation.',
    placement: 'top',
  }),
];

export const EDITOR_TOUR_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.editorNodeLibrary, {
    title: 'The node library',
    content:
      'Every step is a node. Triggers (top) start a workflow; actions do the work; logic nodes branch and loop. Drag one onto the canvas to add it.',
    placement: 'right',
    disableBeacon: true,
  }),
  anchor(TOUR_TARGET.editorCanvas, {
    title: 'Build on the canvas',
    content:
      'Arrange your nodes here, then connect them: drag from a node’s bottom handle to the next node’s top handle to set the order.',
    placement: 'top',
  }),
  concept({
    title: 'Configure a node in 3 steps',
    content:
      'Click any node to open its panel on the right. Setup is a short checklist: 1 Connection (link the app) → 2 Configure (fill the fields) → 3 Test. Finished steps collapse to a summary so it never feels overwhelming.',
  }),
  concept({
    title: 'Reuse data with data pills',
    content:
      'In a field, type “{{” to drop in a data pill — a value from an earlier node’s output, like {{steps.trigger.email}}. No code required; the editor wires the reference for you.',
  }),
  concept({
    title: 'Test a single node',
    content:
      'Step 3 “Test” runs just that node with your real connection and shows the result inline as a tree or table — so you can confirm one step works before running the whole flow.',
  }),
  concept({
    title: 'Configure vs Result',
    content:
      'Once a run is loaded, a Configure / Result switch appears in the toolbar — flip to “Result” to inspect the data each node produced, then back to “Configure” to keep editing.',
  }),
  anchor(TOUR_TARGET.editorSave, {
    title: 'Save your work',
    content: 'Save to keep your changes and create a new version you can restore later.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.editorTest, {
    title: 'Test the whole workflow',
    content:
      'Run the current canvas without saving. Heads up: side effects (API calls, emails) fire by default — set `mockOnDryRun: true` on a node to mock it instead.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.editorRun, {
    title: 'Run it for real',
    content: 'Execute the saved workflow and watch each node light up with live results.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.editorInspector, {
    title: 'Inspect every run',
    content:
      'The dock shows each run step by step — inputs, outputs, logs, versions, and AI-generated docs. Failed steps surface a structured error card with a plain-language hint and a fix action.',
    placement: 'top',
  }),
];

export const CONNECTIONS_TOUR_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.connectionsTabs, {
    title: 'My vs Available',
    content:
      '“My” holds the apps you’ve already connected. “Available” is the full catalog you can add — search to find one.',
    placement: 'bottom',
    disableBeacon: true,
  }),
  concept({
    title: 'Connect an app',
    content:
      'Open “Available” and pick a provider. Some use a one-click OAuth sign-in (Google, Slack, GitHub…); others ask for an API key. Credentials are encrypted at rest — never shown again.',
  }),
];

export const LIBRARY_TOUR_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.librarySearch, {
    title: 'Start from a template',
    content: 'Search ready-made workflows by name or what they do.',
    placement: 'bottom',
    disableBeacon: true,
  }),
  anchor(TOUR_TARGET.libraryGrid, {
    title: 'Use a template',
    content:
      'Templates are grouped by department. “Use template” clones one into your workspace and opens it in the editor, ready to customize.',
    placement: 'top',
  }),
];

export const HISTORY_TOUR_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.historyFilters, {
    title: 'Find any run',
    content: 'Filter every execution across your workflows by status, workflow, and date.',
    placement: 'bottom',
    disableBeacon: true,
  }),
  anchor(TOUR_TARGET.historyList, {
    title: 'Replay a run',
    content: 'Click a run to open it in the editor and step through exactly what each node did.',
    placement: 'top',
  }),
];

// ---------------------------------------------------------------------------
// Tour registry + route resolution
// ---------------------------------------------------------------------------

export const TOUR_ID = {
  home: 'home',
  dashboard: 'dashboard',
  workflows: 'workflows',
  editor: 'editor',
  connections: 'connections',
  library: 'library',
  history: 'history',
} as const;

export type TourId = (typeof TOUR_ID)[keyof typeof TOUR_ID];

export interface TourDefinition {
  id: TourId;
  label: string;
  steps: TourStep[];
  /** True when this tour applies to the given route. */
  matchRoute: (pathname: string) => boolean;
  /**
   * Static route the Help hub navigates to before replaying this tour. Omitted
   * for the editor tour, whose route is a dynamic /workflows/:id — it can only
   * be replayed while already in an editor.
   */
  navRoute?: string;
}

const isEditorRoute = (pathname: string): boolean => /^\/workflows\/[^/]+/.test(pathname);

export const TOURS: Record<TourId, TourDefinition> = {
  home: {
    id: 'home',
    label: 'Home',
    steps: HOME_TOUR_STEPS,
    matchRoute: (p) => p === '/',
    navRoute: '/',
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    steps: DASHBOARD_TOUR_STEPS,
    matchRoute: (p) => p === '/dashboard',
    navRoute: '/dashboard',
  },
  workflows: {
    id: 'workflows',
    label: 'Workflows',
    steps: WORKFLOWS_TOUR_STEPS,
    matchRoute: (p) => p === '/workflows',
    navRoute: '/workflows',
  },
  editor: {
    id: 'editor',
    label: 'Workflow editor',
    steps: EDITOR_TOUR_STEPS,
    matchRoute: isEditorRoute,
  },
  connections: {
    id: 'connections',
    label: 'Connections',
    steps: CONNECTIONS_TOUR_STEPS,
    matchRoute: (p) => p === '/connections',
    navRoute: '/connections',
  },
  library: {
    id: 'library',
    label: 'Library',
    steps: LIBRARY_TOUR_STEPS,
    matchRoute: (p) => p === '/library',
    navRoute: '/library',
  },
  history: {
    id: 'history',
    label: 'History',
    steps: HISTORY_TOUR_STEPS,
    matchRoute: (p) => p === '/history',
    navRoute: '/history',
  },
};

/** Tours offered in the Help hub, in a sensible learning order. */
export const TOUR_ORDER: TourId[] = [
  'home',
  'workflows',
  'editor',
  'connections',
  'library',
  'history',
  'dashboard',
];

export const getTour = (tourId: TourId): TourDefinition => TOURS[tourId];

export const getTourIdForRoute = (pathname: string): TourId | null => {
  const found = TOUR_ORDER.find((id) => TOURS[id].matchRoute(pathname));
  return found ?? null;
};

export const getTourSteps = (pathname: string): TourStep[] => {
  const id = getTourIdForRoute(pathname);
  return id ? TOURS[id].steps : [];
};

export const hasTourForRoute = (pathname: string): boolean => getTourIdForRoute(pathname) !== null;

// ---------------------------------------------------------------------------
// First-access guided sequence
// ---------------------------------------------------------------------------

// Tag a step with the route it lives on. AppTour navigates there on entry and
// the element-ready gate holds the tooltip until the page + target mount.
const routed = (route: string, step: TourStep): TourStep => ({ ...step, route });

// Orientation steps anchor on the always-mounted sidebar, so they render from
// any page. Retained for back-compat / the standalone editor tour replay.
export const ORIENTATION_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.sidebar, {
    title: 'Welcome to TieTide',
    content:
      'TieTide connects your apps and automates the busywork. Let’s take a quick lap — these are your main areas.',
    placement: 'right',
    disableBeacon: true,
  }),
  anchor(TOUR_TARGET.workflowsNav, {
    title: 'Workflows',
    content: 'Where you build and manage your automations.',
    placement: 'right',
  }),
  anchor(TOUR_TARGET.libraryNav, {
    title: 'Library',
    content: 'Pre-built templates to get started in seconds.',
    placement: 'right',
  }),
];

// The multi-page lap: one or two steps per main area, each navigating to its
// route so the user sees the real page behind the tooltip.
const FIRST_ACCESS_PAGE_STEPS: TourStep[] = [
  routed(
    '/',
    anchor(TOUR_TARGET.sidebar, {
      title: 'Welcome to TieTide',
      content:
        'TieTide connects your apps and automates the busywork. Let’s take a quick lap of your workspace, then build a workflow together.',
      placement: 'right',
      disableBeacon: true,
    }),
  ),
  routed(
    '/',
    anchor(TOUR_TARGET.homeQuickActions, {
      title: 'Quick actions',
      content: 'From home you can jump straight into building or browse ready-made templates.',
      placement: 'bottom',
    }),
  ),
  routed(
    '/workflows',
    anchor(TOUR_TARGET.workflowsNew, {
      title: 'Your workflows',
      content:
        'This is where your automations live. “New workflow” starts one from scratch; you can also import one from JSON.',
      placement: 'bottom',
    }),
  ),
  routed(
    '/workflows',
    anchor(TOUR_TARGET.workflowsList, {
      title: 'Organize and open',
      content:
        'Open a workflow to edit it, toggle it active, or use folders and tags to keep things tidy as you grow.',
      placement: 'top',
    }),
  ),
  routed(
    '/connections',
    anchor(TOUR_TARGET.connectionsTabs, {
      title: 'Connections',
      content:
        'Link the apps your workflows use — Gmail, Slack, Sheets, and more. “Available” is the full catalog; “My” holds what you’ve connected. Credentials are encrypted at rest.',
      placement: 'bottom',
    }),
  ),
  routed(
    '/library',
    anchor(TOUR_TARGET.librarySearch, {
      title: 'Template library',
      content: 'Not sure where to start? Search ready-made workflows by name or what they do.',
      placement: 'bottom',
    }),
  ),
  routed(
    '/library',
    anchor(TOUR_TARGET.libraryGrid, {
      title: 'Use a template',
      content:
        '“Use template” clones one into your workspace and opens it in the editor, ready to customize.',
      placement: 'top',
    }),
  ),
  routed(
    '/history',
    anchor(TOUR_TARGET.historyFilters, {
      title: 'Run history',
      content:
        'Every execution across your workflows lands here. Filter by status, workflow, and date to find any run.',
      placement: 'bottom',
    }),
  ),
  routed(
    '/dashboard',
    anchor(TOUR_TARGET.dashboardRange, {
      title: 'Dashboard',
      content:
        'A bird’s-eye view of your automations — runs, success rate, and connection health over the last 7, 30, or 90 days.',
      placement: 'bottom',
    }),
  ),
  routed(
    '/dashboard',
    anchor(TOUR_TARGET.dashboardSummary, {
      title: 'Now let’s build one',
      content:
        'That’s the tour of your workspace. Next we’ll open the editor on a real sample — an email-triage workflow — and walk through building it.',
      placement: 'bottom',
    }),
  ),
];

// The editor deep-dive. Fully anchored: it runs on the seeded sample workflow
// (see AppTour.SAMPLE_WORKFLOW_BODY), so the "configure" / "data pills" steps
// select a real node to reveal the config panel rather than floating centered.
const FIRST_ACCESS_EDITOR_STEPS: TourStep[] = [
  anchor(TOUR_TARGET.editorNodeLibrary, {
    title: 'The node library',
    content:
      'Every step is a node. Triggers (top) start a workflow; actions do the work; logic nodes branch and loop. Drag one onto the canvas to add it.',
    placement: 'right',
    disableBeacon: true,
  }),
  anchor(TOUR_TARGET.editorCanvas, {
    title: 'Build on the canvas',
    content:
      'Here’s the sample: when an email arrives, Ollama categorizes it, the category is added back as a Gmail label, and a row is appended to a Google Sheet. Nodes connect top-handle to bottom-handle to set the order.',
    placement: 'top',
  }),
  {
    ...anchor(TOUR_TARGET.editorConfigPanel, {
      title: 'Configure a node in 3 steps',
      content:
        'Click any node to open this panel. Setup is a short checklist: 1 Connection (link the app) → 2 Configure (fill the fields) → 3 Test. Finished steps collapse to a summary so it never feels overwhelming.',
      placement: 'left',
    }),
    selectNodeId: 'trigger',
  },
  {
    ...anchor(TOUR_TARGET.editorConfigPanel, {
      title: 'Reuse data with data pills',
      content:
        'In a field, type “{{” to drop in a data pill — a value from an earlier node’s output, like {{steps.trigger.subject}}. Here the categorizer’s prompt reuses the incoming email. No code; the editor wires the reference for you.',
      placement: 'left',
    }),
    selectNodeId: 'categorize',
  },
  {
    ...anchor(TOUR_TARGET.editorConfigPanel, {
      title: 'Test a single node',
      content:
        'Step 3 “Test” runs just this node with your real connection and shows the result inline as a tree or table — so you can confirm one step works before running the whole flow.',
      placement: 'left',
    }),
    selectNodeId: 'categorize',
  },
  anchor(TOUR_TARGET.editorSave, {
    title: 'Save your work',
    content: 'Save to keep your changes and create a new version you can restore later.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.editorTest, {
    title: 'Test the whole workflow',
    content:
      'Run the current canvas without saving. Heads up: side effects (API calls, emails) fire by default — set `mockOnDryRun: true` on a node to mock it instead.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.editorRun, {
    title: 'Run it for real',
    content: 'Execute the saved workflow and watch each node light up with live results.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.editorDocs, {
    title: 'AI documentation',
    content:
      'Generate plain-language docs for the whole workflow — what it does, step by step — straight from the canvas.',
    placement: 'bottom',
  }),
  anchor(TOUR_TARGET.editorInspector, {
    title: 'Inspect every run',
    content:
      'After a run, this dock shows each step’s inputs, outputs, logs, versions, and docs. A Configure / Result switch appears in the toolbar — flip to “Result” to inspect the data each node produced, then back to keep editing.',
    placement: 'left',
  }),
];

export const FIRST_ACCESS_STEPS: TourStep[] = [
  ...FIRST_ACCESS_PAGE_STEPS,
  ...FIRST_ACCESS_EDITOR_STEPS,
];

/** Step index at which the first-access flow transitions into the editor. */
export const FIRST_ACCESS_EDITOR_START = FIRST_ACCESS_PAGE_STEPS.length;
