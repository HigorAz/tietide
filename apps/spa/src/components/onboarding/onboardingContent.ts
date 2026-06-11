import type { TourId } from './tours';

/**
 * Single source of truth for the Help hub's concept explainers — the
 * comprehensive teaching layer that doubles as a quick reference. Each concept
 * may link to a tour ("Show me") that demonstrates it in context.
 */
export interface Concept {
  id: string;
  title: string;
  body: string;
  /** Optional tour to launch from the concept's "Show me" action. */
  tourId?: TourId;
}

export const CONCEPTS: Concept[] = [
  {
    id: 'workflow',
    title: 'What is a workflow?',
    body: 'A workflow is an automation: a trigger that starts it, then a chain of actions that do the work. You build it visually by dragging nodes onto the canvas and connecting them.',
    tourId: 'editor',
  },
  {
    id: 'nodes',
    title: 'Triggers, actions & logic',
    body: 'Triggers start a run (a schedule, a webhook, a new email). Actions perform a task (send a message, create a record, call an API). Logic nodes branch, loop, or stop the flow.',
  },
  {
    id: 'connections',
    title: 'Connections',
    body: 'Connections store the credentials your nodes use to reach other apps. Add them once — via one-click OAuth or an API key — and reuse them across workflows. They are encrypted at rest.',
    tourId: 'connections',
  },
  {
    id: 'node-panel',
    title: 'Setting up a node',
    body: 'Selecting a node opens a short, guided panel: 1 Connection → 2 Configure → 3 Test. Each finished step collapses to a summary, so even a complex node never feels overwhelming.',
    tourId: 'editor',
  },
  {
    id: 'data-pills',
    title: 'Data pills',
    body: 'Data pills pass a value from one node into a later one. In any field, type “{{” to insert a pill like {{steps.trigger.email}} — no code, and the editor keeps the reference valid as you edit.',
    tourId: 'editor',
  },
  {
    id: 'test-vs-run',
    title: 'Test vs Run',
    body: 'Test runs your current (unsaved) canvas as a dry run; Run executes the last saved workflow for real. Both fire real side effects by default — set mockOnDryRun on a node to mock it during a test.',
    tourId: 'editor',
  },
  {
    id: 'results',
    title: 'Reading results',
    body: 'After a run, each node’s data is shown as a collapsible tree, a table (for lists), or raw JSON — never an unreadable blob. A failed step gets a structured error card with a plain-language hint and a fix action.',
    tourId: 'editor',
  },
  {
    id: 'executions',
    title: 'Executions & history',
    body: 'Every run is an execution you can inspect step by step. The History page lists them all across your workflows; click one to replay exactly what each node did.',
    tourId: 'history',
  },
  {
    id: 'versions',
    title: 'Versions & restore',
    body: 'Each save creates a version. The editor’s Versions tab lets you review past versions and restore one if a change didn’t work out.',
  },
  {
    id: 'ai-docs',
    title: 'AI documentation',
    body: 'TieTide can generate plain-language documentation of a workflow for you — what it does, step by step — from the editor’s AI Docs button or the workflow row menu.',
  },
  {
    id: 'folders-tags',
    title: 'Folders & tags',
    body: 'Organize workflows into folders and label them with tags, then filter the list to find what you need. Drag a workflow onto a folder to move it.',
    tourId: 'workflows',
  },
  {
    id: 'library',
    title: 'Templates',
    body: 'The Library has ready-made workflows grouped by department. “Use template” clones one into your workspace and opens it in the editor, ready to customize.',
    tourId: 'library',
  },
  {
    id: 'workspace-billing',
    title: 'Workspaces, members & billing',
    body: 'A workspace is your billing and collaboration unit. Invite members to share workflows and connections; the owner manages the plan and seats from Workspace settings.',
  },
];

/** Free-text search across concept titles and bodies. */
export const filterConcepts = (query: string): Concept[] => {
  const q = query.trim().toLowerCase();
  if (!q) return CONCEPTS;
  return CONCEPTS.filter(
    (c) => c.title.toLowerCase().includes(q) || c.body.toLowerCase().includes(q),
  );
};
