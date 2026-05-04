import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { Workflow } from '@tietide/shared';
import type { WorkflowTemplate } from '@/api/library';

function EditorPeek(): JSX.Element {
  const { id } = useParams();
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return (
    <div>
      <div data-testid="peek-id">{id ?? ''}</div>
      <div data-testid="peek-from">{typeof from === 'string' ? from : ''}</div>
    </div>
  );
}

vi.mock('@/api/library', () => ({
  listTemplates: vi.fn(),
  instantiateTemplate: vi.fn(),
}));

import * as libraryApi from '@/api/library';
import { useLibraryStore } from '@/stores/libraryStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { Toaster } from '@/components/ui/Toaster';
import { LibraryPage } from './LibraryPage';

const mockedList = vi.mocked(libraryApi.listTemplates);
const mockedInstantiate = vi.mocked(libraryApi.instantiateTemplate);

const makeTemplate = (overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate => ({
  slug: 'cron-fetch-process',
  name: 'Demo: Cron → Fetch → Archive',
  description: 'Cron fixture',
  category: 'Schedule',
  nodeTypes: ['cron-trigger', 'http-request'],
  ...overrides,
});

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-new',
  name: 'Demo: Cron → Fetch → Archive',
  description: 'Cron fixture',
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-05-04T10:00:00Z'),
  updatedAt: new Date('2026-05-04T10:00:00Z'),
  executionCount: 0,
  documentation: null,
  ...overrides,
});

const sampleTemplates: WorkflowTemplate[] = [
  makeTemplate({
    slug: 'webhook-conditional-notification',
    name: 'Demo: Webhook → Enrich → IF → Notify',
    description: 'Inbound webhook with conditional notify',
    category: 'Webhook',
    nodeTypes: ['webhook-trigger', 'http-request', 'conditional'],
  }),
  makeTemplate({
    slug: 'cron-fetch-process',
    name: 'Demo: Cron → Fetch → Archive',
    description: 'Hourly cron pulls and archives',
    category: 'Schedule',
    nodeTypes: ['cron-trigger', 'http-request'],
  }),
  makeTemplate({
    slug: 'manual-ai-docs-showcase',
    name: 'Demo: Manual → Multi-step (AI Docs Showcase)',
    description: 'Pipeline rich enough for the AI docs generator',
    category: 'AI',
    nodeTypes: ['manual-trigger', 'http-request', 'conditional'],
  }),
  makeTemplate({
    slug: 'manual-failure-dlq',
    name: 'Demo: Manual → Failure (DLQ Showcase)',
    description: 'DLQ resilience demo',
    category: 'Reliability',
    nodeTypes: ['manual-trigger', 'http-request'],
  }),
];

const renderLibrary = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/library']}>
      <Toaster />
      <Routes>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/workflows/:id" element={<EditorPeek />} />
      </Routes>
    </MemoryRouter>,
  );

const resetStore = (): void => {
  useLibraryStore.setState({
    templates: [],
    status: 'idle',
    error: null,
    search: '',
    category: null,
  });
};

describe('LibraryPage', () => {
  beforeEach(() => {
    resetStore();
    useToastStore.setState({ ...initialToastState });
    mockedList.mockReset();
    mockedInstantiate.mockReset();
  });

  it('renders one card per template returned by listTemplates (AC: SPA grid renders all templates)', async () => {
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    expect(await screen.findByText('Demo: Webhook → Enrich → IF → Notify')).toBeInTheDocument();
    for (const tpl of sampleTemplates) {
      expect(screen.getByText(tpl.name)).toBeInTheDocument();
    }
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('shows the category badge on every card', async () => {
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    // Wait for at least one card to render before asserting badges.
    await screen.findByText('Demo: Webhook → Enrich → IF → Notify');

    // Each category appears twice (filter chip + card badge), so use getAllByText.
    for (const cat of ['Webhook', 'Schedule', 'AI', 'Reliability']) {
      expect(screen.getAllByText(cat).length).toBeGreaterThanOrEqual(1);
    }

    // Specifically assert the card-level badge by scoping inside a card.
    const card = screen
      .getByText('Demo: Webhook → Enrich → IF → Notify')
      .closest('[data-testid="template-card"]') as HTMLElement;
    expect(within(card).getByText('Webhook')).toBeInTheDocument();
  });

  it('filters cards client-side by name as the user types (AC: search filters client-side by name)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    expect(await screen.findByText(/cron → fetch → archive/i)).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: /search templates/i });
    await user.type(search, 'webhook');

    expect(screen.getByText(/webhook → enrich → if → notify/i)).toBeInTheDocument();
    expect(screen.queryByText(/cron → fetch → archive/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ai docs showcase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dlq showcase/i)).not.toBeInTheDocument();
  });

  it('narrows results when a category filter is selected', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    expect(await screen.findByText(/cron → fetch → archive/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^filter by ai$/i }));

    expect(screen.getByText(/ai docs showcase/i)).toBeInTheDocument();
    expect(screen.queryByText(/cron → fetch → archive/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dlq showcase/i)).not.toBeInTheDocument();
  });

  it('navigates to /workflows/:newId after a successful instantiation (AC: Use template navigates to editor)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);
    mockedInstantiate.mockResolvedValueOnce(makeWorkflow({ id: 'instantiated-uuid' }));

    renderLibrary();

    const cronCard = (await screen.findByText(/cron → fetch → archive/i)).closest(
      '[data-testid="template-card"]',
    ) as HTMLElement;
    await user.click(within(cronCard).getByRole('button', { name: /use template/i }));

    await waitFor(() => expect(mockedInstantiate).toHaveBeenCalledWith('cron-fetch-process'));
    expect(await screen.findByTestId('peek-id')).toHaveTextContent('instantiated-uuid');
    expect(screen.getByTestId('peek-from')).toHaveTextContent('/library');
  });

  it('shows an error toast and re-enables the button when instantiate rejects', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);
    mockedInstantiate.mockRejectedValueOnce(new Error('Template not found'));

    renderLibrary();

    const card = (await screen.findByText(/cron → fetch → archive/i)).closest(
      '[data-testid="template-card"]',
    ) as HTMLElement;
    const button = within(card).getByRole('button', { name: /use template/i });
    await user.click(button);

    expect(await screen.findByText(/template not found/i)).toBeInTheDocument();
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
    // Button is re-enabled after the failure (user can retry).
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('shows a loading message while the initial fetch is in flight', async () => {
    let resolve!: (rows: WorkflowTemplate[]) => void;
    mockedList.mockReturnValueOnce(
      new Promise<WorkflowTemplate[]>((r) => {
        resolve = r;
      }),
    );

    renderLibrary();

    expect(screen.getByText(/loading templates/i)).toBeInTheDocument();

    // Drain the pending fetch before unmount so the state update settles inside act().
    resolve(sampleTemplates);
    await waitFor(() => expect(screen.queryByText(/loading templates/i)).not.toBeInTheDocument());
  });

  it('shows an empty state when the search matches no templates', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    expect(await screen.findByText(/cron → fetch → archive/i)).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: /search templates/i });
    await user.type(search, 'xyzzz');

    expect(screen.getByText(/no templates match/i)).toBeInTheDocument();
  });
});
