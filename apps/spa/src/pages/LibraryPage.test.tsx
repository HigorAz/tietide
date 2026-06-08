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
  slug: 'lead-capture-to-crm',
  name: 'Lead capture → CRM → hot-lead alert',
  description: 'Normalize a lead and push it to HubSpot',
  category: 'Sales',
  nodeTypes: ['webhook-trigger', 'code', 'hubspot-create-contact'],
  ...overrides,
});

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-new',
  name: 'Lead capture → CRM → hot-lead alert',
  description: 'Sales template',
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-05-04T10:00:00Z'),
  updatedAt: new Date('2026-05-04T10:00:00Z'),
  executionCount: 0,
  documentation: null,
  folderId: null,
  tags: [],
  ...overrides,
});

// Spans 4 departments; Marketing has two templates so we can assert one section
// holding multiple cards.
const sampleTemplates: WorkflowTemplate[] = [
  makeTemplate({
    slug: 'lead-capture-to-crm',
    name: 'Lead capture → CRM → hot-lead alert',
    description: 'Push inbound leads to the CRM',
    category: 'Sales',
    nodeTypes: ['webhook-trigger', 'code', 'hubspot-create-contact'],
  }),
  makeTemplate({
    slug: 'new-subscriber-welcome',
    name: 'New subscriber welcome series',
    description: 'Welcome a new Mailchimp subscriber by email',
    category: 'Marketing',
    nodeTypes: ['mailchimp-subscriber-added', 'gmail-send'],
  }),
  makeTemplate({
    slug: 'daily-hn-ai-digest',
    name: 'Daily Hacker News AI digest',
    description: 'Summarize Hacker News stories with Claude',
    category: 'Marketing',
    nodeTypes: ['cron-trigger', 'http-request', 'claude-messages'],
  }),
  makeTemplate({
    slug: 'github-issue-ai-triage',
    name: 'GitHub issue AI triage',
    description: 'Triage new GitHub issues with Claude',
    category: 'Engineering',
    nodeTypes: ['github-issue-opened', 'claude-messages', 'code'],
  }),
  makeTemplate({
    slug: 'weather-ops-alert',
    name: 'Weather ops alert',
    description: 'Alert on severe weather from the Open-Meteo API',
    category: 'Operations & Finance',
    nodeTypes: ['cron-trigger', 'http-request', 'telegram-send-message'],
  }),
];

const representedDepartments = ['Sales', 'Marketing', 'Engineering', 'Operations & Finance'];

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

const sectionHeadings = (): string[] =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');

describe('LibraryPage', () => {
  beforeEach(() => {
    resetStore();
    useToastStore.setState({ ...initialToastState });
    mockedList.mockReset();
    mockedInstantiate.mockReset();
  });

  it('renders one section per department with a heading and one card per template (AC: grouped sections)', async () => {
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    await screen.findByText('Lead capture → CRM → hot-lead alert');

    // One section heading (h2) per represented department, in fixed order.
    expect(sectionHeadings()).toEqual(representedDepartments);
    for (const dept of representedDepartments) {
      expect(screen.getByRole('heading', { level: 2, name: dept })).toBeInTheDocument();
    }

    // One card per template overall.
    expect(screen.getAllByTestId('template-card')).toHaveLength(sampleTemplates.length);

    // The Marketing section holds its two cards.
    const marketing = screen.getByRole('list', { name: /marketing templates/i });
    expect(within(marketing).getAllByTestId('template-card')).toHaveLength(2);
    expect(within(marketing).getByText('Daily Hacker News AI digest')).toBeInTheDocument();
    expect(within(marketing).getByText('New subscriber welcome series')).toBeInTheDocument();

    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('filters cards by name across groups and hides empty groups (AC: search across groups)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    await screen.findByText('Lead capture → CRM → hot-lead alert');

    const search = screen.getByRole('searchbox', { name: /search templates/i });
    await user.type(search, 'welcome');

    // Only the matching Marketing card remains; its section heading stays, the
    // other departments' headings are gone (empty groups hidden).
    expect(screen.getByText('New subscriber welcome series')).toBeInTheDocument();
    expect(screen.queryByText('Lead capture → CRM → hot-lead alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Daily Hacker News AI digest')).not.toBeInTheDocument();
    expect(sectionHeadings()).toEqual(['Marketing']);
  });

  it('filters cards by description across groups (AC: search by name/description)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    await screen.findByText('Lead capture → CRM → hot-lead alert');

    const search = screen.getByRole('searchbox', { name: /search templates/i });
    await user.type(search, 'open-meteo');

    expect(screen.getByText('Weather ops alert')).toBeInTheDocument();
    expect(sectionHeadings()).toEqual(['Operations & Finance']);
  });

  it('navigates to /workflows/:newId after a successful instantiation (AC: Use template navigates to editor)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);
    mockedInstantiate.mockResolvedValueOnce(makeWorkflow({ id: 'instantiated-uuid' }));

    renderLibrary();

    const card = (await screen.findByText('Lead capture → CRM → hot-lead alert')).closest(
      '[data-testid="template-card"]',
    ) as HTMLElement;
    await user.click(within(card).getByRole('button', { name: /use template/i }));

    await waitFor(() => expect(mockedInstantiate).toHaveBeenCalledWith('lead-capture-to-crm'));
    expect(await screen.findByTestId('peek-id')).toHaveTextContent('instantiated-uuid');
    expect(screen.getByTestId('peek-from')).toHaveTextContent('/library');
  });

  it('shows an error toast and re-enables the button when instantiate rejects', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);
    mockedInstantiate.mockRejectedValueOnce(new Error('Template not found'));

    renderLibrary();

    const card = (await screen.findByText('Lead capture → CRM → hot-lead alert')).closest(
      '[data-testid="template-card"]',
    ) as HTMLElement;
    const button = within(card).getByRole('button', { name: /use template/i });
    await user.click(button);

    expect(await screen.findByText(/template not found/i)).toBeInTheDocument();
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
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

    resolve(sampleTemplates);
    await waitFor(() => expect(screen.queryByText(/loading templates/i)).not.toBeInTheDocument());
  });

  it('shows an empty state when the search matches no templates', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(sampleTemplates);

    renderLibrary();

    await screen.findByText('Lead capture → CRM → hot-lead alert');

    const search = screen.getByRole('searchbox', { name: /search templates/i });
    await user.type(search, 'xyzzz');

    expect(screen.getByText(/no templates match/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });
});
