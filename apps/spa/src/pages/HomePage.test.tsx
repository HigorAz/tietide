import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Workflow, WorkflowExecution, PublicUser } from '@tietide/shared';

vi.mock('@/api/workflows', () => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  toggleWorkflowActive: vi.fn(),
}));

vi.mock('@/api/executions', () => ({
  listExecutions: vi.fn(),
  listAllExecutions: vi.fn(),
  getExecution: vi.fn(),
  listExecutionSteps: vi.fn(),
}));

import * as workflowsApi from '@/api/workflows';
import * as executionsApi from '@/api/executions';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useExecutionsStore } from '@/stores/executionsStore';
import { useAuthStore } from '@/stores/authStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { Toaster } from '@/components/ui/Toaster';
import { HomePage } from './HomePage';

const mockedListWorkflows = vi.mocked(workflowsApi.listWorkflows);
const mockedCreateWorkflow = vi.mocked(workflowsApi.createWorkflow);
const mockedListAllExecutions = vi.mocked(executionsApi.listAllExecutions);

function LocationStatePeek(): JSX.Element {
  const location = useLocation();
  const search = location.search;
  return (
    <div>
      <div data-testid="peek-pathname">{location.pathname}</div>
      <div data-testid="peek-search">{search}</div>
    </div>
  );
}

const makeUser = (overrides: Partial<PublicUser> = {}): PublicUser => ({
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'USER',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'Workflow One',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-04-01T12:00:00Z'),
  updatedAt: new Date('2026-04-10T12:00:00Z'),
  executionCount: 0,
  documentation: null,
  folderId: null,
  tags: [],
  ...overrides,
});

const makeExecution = (overrides: Partial<WorkflowExecution> = {}): WorkflowExecution => ({
  id: 'exec-1',
  workflowId: 'wf-1',
  status: 'SUCCESS',
  triggerType: 'manual',
  triggerData: null,
  startedAt: new Date('2026-04-20T10:00:00Z'),
  finishedAt: new Date('2026-04-20T10:00:05Z'),
  error: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  ...overrides,
});

const initialAuthState = useAuthStore.getState();
const realFetchList = useExecutionsStore.getState().fetchList;

const resetStores = (): void => {
  useAuthStore.setState({ ...initialAuthState, user: null }, true);
  useWorkflowsStore.setState({ workflows: [], status: 'idle', error: null });
  useExecutionsStore.setState({
    list: [],
    listTotal: 0,
    listStatus: 'idle',
    listError: null,
    listNextCursor: null,
    filters: {},
    fetchList: realFetchList,
  });
  useToastStore.setState({ ...initialToastState });
};

const renderHome = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Toaster />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workflows/:id" element={<LocationStatePeek />} />
        <Route path="/library" element={<div>Library page</div>} />
        <Route path="/connections" element={<div>Connections page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('HomePage', () => {
  beforeEach(() => {
    resetStores();
    mockedListWorkflows.mockReset();
    mockedCreateWorkflow.mockReset();
    mockedListAllExecutions.mockReset();
    // Default to empty so tests opt-in to data when relevant.
    mockedListWorkflows.mockResolvedValue([]);
    mockedListAllExecutions.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 5,
      nextCursor: null,
    });
  });

  it('renders the greeting with user.name (AC: greeting)', async () => {
    useAuthStore.setState({ user: makeUser({ name: 'Alice' }) });

    renderHome();

    expect(await screen.findByText(/welcome back, alice/i)).toBeInTheDocument();
  });

  it('falls back to email when user.name is empty', async () => {
    useAuthStore.setState({ user: makeUser({ name: '', email: 'bob@example.com' }) });

    renderHome();

    expect(await screen.findByText(/welcome back, bob@example\.com/i)).toBeInTheDocument();
  });

  it('renders three quick-action CTAs (AC: CTA cards)', async () => {
    useAuthStore.setState({ user: makeUser() });
    renderHome();

    expect(await screen.findByRole('button', { name: /create workflow/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect a service/i })).toBeInTheDocument();
  });

  it('navigates to /library when "Browse library" is clicked (AC: CTA routing)', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: makeUser() });
    renderHome();

    await user.click(await screen.findByRole('button', { name: /browse library/i }));

    expect(await screen.findByText(/library page/i)).toBeInTheDocument();
  });

  it('navigates to /connections when "Connect a service" is clicked (AC: CTA routing)', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: makeUser() });
    renderHome();

    await user.click(await screen.findByRole('button', { name: /connect a service/i }));

    expect(await screen.findByText(/connections page/i)).toBeInTheDocument();
  });

  it('opens NewWorkflowModal when "Create workflow" is clicked (AC: CTA routing)', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: makeUser() });
    renderHome();

    await user.click(await screen.findByRole('button', { name: /create workflow/i }));

    expect(
      await screen.findByRole('dialog', { name: /create a new workflow/i }),
    ).toBeInTheDocument();
  });

  it('navigates to the editor after creating a workflow from the CTA', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: makeUser() });
    mockedCreateWorkflow.mockResolvedValueOnce(makeWorkflow({ id: 'new', name: 'New' }));
    renderHome();

    await user.click(await screen.findByRole('button', { name: /create workflow/i }));
    await user.type(await screen.findByLabelText(/name/i), 'New');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('peek-pathname')).toHaveTextContent('/workflows/new');
    });
  });

  it('calls executionsStore.fetchList({ pageSize: 5 }) on mount (AC: recent activity)', async () => {
    const fetchListSpy = vi.fn(async () => undefined);
    useExecutionsStore.setState({ fetchList: fetchListSpy });
    useAuthStore.setState({ user: makeUser() });

    renderHome();

    await waitFor(() => {
      expect(fetchListSpy).toHaveBeenCalledWith({ pageSize: 5 });
    });
  });

  it('renders the empty state when the user has 0 workflows AND 0 executions (AC: empty state)', async () => {
    useAuthStore.setState({ user: makeUser() });

    renderHome();

    expect(await screen.findByText(/let's build your first workflow/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse the library/i })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  it('renders recent workflows sorted by updatedAt desc, top 3', async () => {
    useAuthStore.setState({ user: makeUser() });
    mockedListWorkflows.mockResolvedValue([
      makeWorkflow({ id: 'a', name: 'Alpha', updatedAt: new Date('2026-04-01T00:00:00Z') }),
      makeWorkflow({ id: 'b', name: 'Beta', updatedAt: new Date('2026-04-05T00:00:00Z') }),
      makeWorkflow({ id: 'c', name: 'Gamma', updatedAt: new Date('2026-04-03T00:00:00Z') }),
      makeWorkflow({ id: 'd', name: 'Delta', updatedAt: new Date('2026-04-09T00:00:00Z') }),
    ]);

    renderHome();

    const headings = await screen.findAllByTestId('recent-workflow-name');
    expect(headings.map((n) => n.textContent)).toEqual(['Delta', 'Beta', 'Gamma']);
  });

  it('navigates to /workflows/:id when a recent workflow card is clicked (AC: workflow click)', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: makeUser() });
    const seven = makeWorkflow({ id: 'wf-7', name: 'Seven' });
    mockedListWorkflows.mockResolvedValue([seven]);

    renderHome();

    await user.click(await screen.findByRole('button', { name: /open seven/i }));

    await waitFor(() => {
      expect(screen.getByTestId('peek-pathname')).toHaveTextContent('/workflows/wf-7');
    });
  });

  it('navigates to /workflows/:wfId?execution=:execId when an execution row is clicked (AC: execution click)', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: makeUser() });
    mockedListWorkflows.mockResolvedValue([makeWorkflow({ id: 'wf-9', name: 'Nine' })]);
    mockedListAllExecutions.mockResolvedValue({
      items: [makeExecution({ id: 'exec-42', workflowId: 'wf-9', status: 'SUCCESS' })],
      total: 1,
      page: 1,
      pageSize: 5,
      nextCursor: null,
    });

    renderHome();

    await user.click(await screen.findByRole('button', { name: /open execution exec-42/i }));

    await waitFor(() => {
      expect(screen.getByTestId('peek-pathname')).toHaveTextContent('/workflows/wf-9');
      expect(screen.getByTestId('peek-search')).toHaveTextContent('execution=exec-42');
    });
  });

  it('does not show the empty state when at least one workflow exists', async () => {
    useAuthStore.setState({ user: makeUser() });
    mockedListWorkflows.mockResolvedValue([makeWorkflow({ id: 'a', name: 'Alpha' })]);

    renderHome();

    await screen.findByText('Alpha');
    expect(screen.queryByText(/let's build your first workflow/i)).not.toBeInTheDocument();
  });
});
