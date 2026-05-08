import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Workflow } from '@tietide/shared';

function LocationStatePeek(): JSX.Element {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <div data-testid="peek-from">{typeof from === 'string' ? from : ''}</div>;
}

vi.mock('@/api/workflows', () => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  toggleWorkflowActive: vi.fn(),
  updateWorkflow: vi.fn(),
}));

vi.mock('@/api/ai', () => ({
  getWorkflowDocs: vi.fn(),
  regenerateWorkflowDocs: vi.fn(),
}));

vi.mock('@/api/folders', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

vi.mock('@/api/tags', () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

import * as workflowsApi from '@/api/workflows';
import * as aiApi from '@/api/ai';
import * as foldersApi from '@/api/folders';
import * as tagsApi from '@/api/tags';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useFoldersStore } from '@/stores/foldersStore';
import { useTagsStore } from '@/stores/tagsStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { Toaster } from '@/components/ui/Toaster';
import { WorkflowsPage } from './WorkflowsPage';

const mockedList = vi.mocked(workflowsApi.listWorkflows);
const mockedCreate = vi.mocked(workflowsApi.createWorkflow);
const mockedDelete = vi.mocked(workflowsApi.deleteWorkflow);
const mockedToggle = vi.mocked(workflowsApi.toggleWorkflowActive);
const mockedUpdate = vi.mocked(workflowsApi.updateWorkflow);
const mockedGetDocs = vi.mocked(aiApi.getWorkflowDocs);
const mockedRegenerateDocs = vi.mocked(aiApi.regenerateWorkflowDocs);
const mockedListFolders = vi.mocked(foldersApi.listFolders);
const mockedCreateFolder = vi.mocked(foldersApi.createFolder);
const mockedDeleteFolder = vi.mocked(foldersApi.deleteFolder);
const mockedListTags = vi.mocked(tagsApi.listTags);

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

const renderWorkflows = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/workflows']}>
      <Toaster />
      <Routes>
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/workflows/:id" element={<div>Editor for workflow</div>} />
      </Routes>
    </MemoryRouter>,
  );

const resetStore = (): void => {
  useWorkflowsStore.setState({
    workflows: [],
    status: 'idle',
    error: null,
    selectedFolderId: undefined,
    selectedTagIds: [],
  });
  useFoldersStore.setState({ folders: [], status: 'idle', error: null });
  useTagsStore.setState({ tags: [], status: 'idle', error: null });
};

describe('WorkflowsPage', () => {
  beforeEach(() => {
    resetStore();
    useToastStore.setState({ ...initialToastState });
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedDelete.mockReset();
    mockedToggle.mockReset();
    mockedUpdate.mockReset();
    mockedGetDocs.mockReset();
    mockedRegenerateDocs.mockReset();
    mockedListFolders.mockReset();
    mockedCreateFolder.mockReset();
    mockedDeleteFolder.mockReset();
    mockedListTags.mockReset();
    mockedListFolders.mockResolvedValue([]);
    mockedListTags.mockResolvedValue([]);
  });

  it('fetches and displays workflows (AC1)', async () => {
    mockedList.mockResolvedValueOnce([
      makeWorkflow({ id: 'a', name: 'Alpha' }),
      makeWorkflow({ id: 'b', name: 'Beta' }),
    ]);

    renderWorkflows();

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('opens the new workflow modal when Create is clicked (AC2)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([]);
    renderWorkflows();

    await user.click(await screen.findByRole('button', { name: /new workflow/i }));

    expect(
      await screen.findByRole('dialog', { name: /create a new workflow/i }),
    ).toBeInTheDocument();
  });

  it('removes a workflow after confirmation (AC3)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
    mockedDelete.mockResolvedValueOnce();

    renderWorkflows();

    await user.click(await screen.findByRole('button', { name: /delete alpha/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
  });

  it('renders an empty state with the issue #111 copy and Library link', async () => {
    mockedList.mockResolvedValueOnce([]);

    renderWorkflows();

    expect(await screen.findByRole('heading', { name: /no workflows yet/i })).toBeInTheDocument();
    expect(screen.getByText(/build from scratch/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /library/i })).toHaveAttribute('href', '/library');
  });

  it('calls toggleWorkflowActive when the active toggle is clicked', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha', isActive: false })]);
    mockedToggle.mockResolvedValueOnce(makeWorkflow({ id: 'a', name: 'Alpha', isActive: true }));

    renderWorkflows();

    await user.click(await screen.findByRole('switch', { name: /toggle active for alpha/i }));

    await waitFor(() => expect(mockedToggle).toHaveBeenCalledWith('a', true));
  });

  it('navigates to /workflows/:id when a card is opened', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);

    renderWorkflows();

    await user.click(await screen.findByRole('button', { name: /open alpha/i }));

    expect(await screen.findByText(/editor for workflow/i)).toBeInTheDocument();
  });

  it('passes from=/workflows in location state when opening a workflow (issue #104)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);

    render(
      <MemoryRouter initialEntries={['/workflows']}>
        <Toaster />
        <Routes>
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/:id" element={<LocationStatePeek />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: /open alpha/i }));

    expect(await screen.findByTestId('peek-from')).toHaveTextContent('/workflows');
  });

  it('passes from=/workflows in location state when creating a workflow (issue #104)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([]);
    mockedCreate.mockResolvedValueOnce(makeWorkflow({ id: 'new', name: 'New' }));

    render(
      <MemoryRouter initialEntries={['/workflows']}>
        <Toaster />
        <Routes>
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/:id" element={<LocationStatePeek />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: /new workflow/i }));
    await user.type(await screen.findByLabelText(/name/i), 'New');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByTestId('peek-from')).toHaveTextContent('/workflows');
  });

  it('shows an error banner with a retry button when the list request fails', async () => {
    mockedList.mockRejectedValueOnce(new Error('network down'));

    renderWorkflows();

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /retry/i });
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
    await userEvent.setup().click(retry);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });

  it('shows a toast when the toggle request fails (issue #41)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha', isActive: false })]);
    mockedToggle.mockRejectedValueOnce(new Error('toggle blew up'));

    renderWorkflows();

    await user.click(await screen.findByRole('switch', { name: /toggle active for alpha/i }));

    expect(await screen.findByText(/toggle blew up/i)).toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });

  it('shows a toast when the delete request fails (issue #41)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
    mockedDelete.mockRejectedValueOnce(new Error('delete failed'));

    renderWorkflows();

    await user.click(await screen.findByRole('button', { name: /delete alpha/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    expect(await screen.findByText(/delete failed/i)).toBeInTheDocument();
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });

  describe('success toasts (issue #107)', () => {
    it('fires a success toast after creating a workflow', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([]);
      mockedCreate.mockResolvedValueOnce(makeWorkflow({ id: 'new', name: 'New' }));

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /new workflow/i }));
      await user.type(await screen.findByLabelText(/name/i), 'New');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'success' && /created/i.test(t.message))).toBe(true);
      });
    });

    it('fires an error toast when creation rejects', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([]);
      mockedCreate.mockRejectedValueOnce(new Error('server exploded'));

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /new workflow/i }));
      await user.type(await screen.findByLabelText(/name/i), 'New');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'error' && /server exploded/i.test(t.message))).toBe(
          true,
        );
      });
    });

    it('fires a success toast after toggling a workflow', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha', isActive: false })]);
      mockedToggle.mockResolvedValueOnce(makeWorkflow({ id: 'a', name: 'Alpha', isActive: true }));

      renderWorkflows();

      await user.click(await screen.findByRole('switch', { name: /toggle active for alpha/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'success')).toBe(true);
      });
    });

    it('fires a success toast after deleting a workflow', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
      mockedDelete.mockResolvedValueOnce();

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /delete alpha/i }));
      await user.click(await screen.findByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'success' && /deleted/i.test(t.message))).toBe(true);
      });
    });
  });

  describe('search and layout (issue #111)', () => {
    it('filters workflows client-side as the user types in the search input', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([
        makeWorkflow({ id: 'a', name: 'Order intake' }),
        makeWorkflow({ id: 'b', name: 'Lead enrichment' }),
        makeWorkflow({ id: 'c', name: 'Daily report' }),
      ]);

      renderWorkflows();

      expect(await screen.findByText('Order intake')).toBeInTheDocument();

      const search = screen.getByRole('searchbox', { name: /search workflows/i });
      await user.type(search, 'lead');

      expect(screen.queryByText('Order intake')).not.toBeInTheDocument();
      expect(screen.queryByText('Daily report')).not.toBeInTheDocument();
      expect(screen.getByText('Lead enrichment')).toBeInTheDocument();
    });

    it('renders rows in a list (regression guard against re-cardification)', async () => {
      mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);

      renderWorkflows();

      const list = await screen.findByRole('list', { name: /workflows/i });
      const items = list.querySelectorAll('[role="listitem"], li');
      expect(items.length).toBeGreaterThan(0);
    });
  });

  describe('inline AI docs lifecycle (issue #111)', () => {
    const docsResponse = {
      workflowId: 'a',
      version: 1,
      documentation: '# Alpha docs\n\n## Objective\n\nSome objective text.',
      sections: {
        objective: 'Some objective text.',
        triggers: '',
        actions: '',
        dataFlow: '',
        decisions: '',
      },
      model: 'llama3.1:8b',
      generatedAt: '2026-05-04T11:00:00Z',
    };

    it('shows "Generate docs" when the workflow has no documentation', async () => {
      mockedList.mockResolvedValueOnce([
        makeWorkflow({ id: 'a', name: 'Alpha', documentation: null }),
      ]);

      renderWorkflows();

      expect(
        await screen.findByRole('button', { name: /generate docs for alpha/i }),
      ).toBeInTheDocument();
    });

    it('shows "Update docs" with relative timestamp when documentation exists', async () => {
      const generatedAt = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3h ago
      mockedList.mockResolvedValueOnce([
        makeWorkflow({
          id: 'a',
          name: 'Alpha',
          documentation: { generatedAt, version: 1 },
        }),
      ]);

      renderWorkflows();

      const button = await screen.findByRole('button', { name: /update docs for alpha/i });
      expect(button).toHaveTextContent(/update docs/i);
      expect(button).toHaveTextContent(/ago/i);
    });

    it('calls regenerateWorkflowDocs (POST) and auto-expands when Generate docs is clicked', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([
        makeWorkflow({ id: 'a', name: 'Alpha', documentation: null }),
      ]);
      mockedRegenerateDocs.mockResolvedValueOnce(docsResponse);

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /generate docs for alpha/i }));

      await waitFor(() => expect(mockedRegenerateDocs).toHaveBeenCalledWith('a'));
      expect(mockedGetDocs).not.toHaveBeenCalled();
      expect(await screen.findByText(/alpha docs/i)).toBeInTheDocument();
      expect(screen.getByText(/some objective text/i)).toBeInTheDocument();
    });

    it('calls getWorkflowDocs (GET) on first expand of the View docs toggle, never the regenerate POST', async () => {
      const user = userEvent.setup();
      const generatedAt = new Date(Date.now() - 60 * 60 * 1000);
      mockedList.mockResolvedValueOnce([
        makeWorkflow({
          id: 'a',
          name: 'Alpha',
          documentation: { generatedAt, version: 1 },
        }),
      ]);
      mockedGetDocs.mockResolvedValueOnce(docsResponse);

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /view docs for alpha/i }));

      await waitFor(() => expect(mockedGetDocs).toHaveBeenCalledWith('a'));
      expect(mockedRegenerateDocs).not.toHaveBeenCalled();
      expect(await screen.findByText(/alpha docs/i)).toBeInTheDocument();

      await user.click(await screen.findByRole('button', { name: /hide docs for alpha/i }));
      expect(screen.queryByText(/alpha docs/i)).not.toBeInTheDocument();
    });

    it('renders an inline empty-state hint when GET returns null (no docs yet) without firing regenerate', async () => {
      const user = userEvent.setup();
      const generatedAt = new Date(Date.now() - 60 * 60 * 1000);
      mockedList.mockResolvedValueOnce([
        makeWorkflow({
          id: 'a',
          name: 'Alpha',
          documentation: { generatedAt, version: 1 },
        }),
      ]);
      mockedGetDocs.mockResolvedValueOnce(null);

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /view docs for alpha/i }));

      expect(await screen.findByText(/not available yet/i)).toBeInTheDocument();
      expect(mockedRegenerateDocs).not.toHaveBeenCalled();
    });

    it('shows an inline error with retry when regeneration fails (no toast spam)', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([
        makeWorkflow({ id: 'a', name: 'Alpha', documentation: null }),
      ]);
      mockedRegenerateDocs.mockRejectedValueOnce(new Error('Ollama unreachable'));

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /generate docs for alpha/i }));

      expect(await screen.findByText(/ollama unreachable/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /retry generating docs for alpha/i }),
      ).toBeInTheDocument();
      // Generation errors stay inline; do not toast.
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe('folders + tags (issue #135)', () => {
    it('renders the folder tree with All / Unfiled pins and seeded folders', async () => {
      mockedList.mockResolvedValue([]);
      mockedListFolders.mockResolvedValue([
        {
          id: 'f-1',
          name: 'Personal',
          parentFolderId: null,
          createdAt: new Date('2026-05-08T00:00:00Z'),
        },
      ]);
      mockedListTags.mockResolvedValue([]);

      renderWorkflows();

      expect(await screen.findByRole('button', { name: /all workflows/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /unfiled/i })).toBeInTheDocument();
      expect(await screen.findByText('Personal')).toBeInTheDocument();
    });

    it('refetches workflows with selectedFolderId when a folder pin is selected', async () => {
      mockedList.mockResolvedValue([]);
      mockedListFolders.mockResolvedValue([]);
      mockedListTags.mockResolvedValue([]);

      const user = userEvent.setup();
      renderWorkflows();

      await waitFor(() => expect(mockedList).toHaveBeenCalled());
      mockedList.mockClear();

      await user.click(await screen.findByRole('button', { name: /unfiled/i }));

      await waitFor(() => {
        expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ folderId: null }));
      });
    });

    it('shows tag chips and toggles a chip to filter the list', async () => {
      mockedList.mockResolvedValue([]);
      mockedListFolders.mockResolvedValue([]);
      mockedListTags.mockResolvedValue([
        {
          id: 't-1',
          name: 'urgent',
          color: '#ef4444',
          createdAt: new Date('2026-05-08T00:00:00Z'),
        },
      ]);

      const user = userEvent.setup();
      renderWorkflows();

      const chip = await screen.findByRole('button', { name: 'urgent' });
      expect(chip).toHaveAttribute('aria-pressed', 'false');

      mockedList.mockClear();
      await user.click(chip);

      await waitFor(() => {
        expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ tagIds: ['t-1'] }));
      });
    });

    it('opens the cascade-aware delete dialog with the impact counts', async () => {
      mockedList.mockResolvedValue([
        makeWorkflow({ id: 'wf-1', folderId: 'f-1' }),
        makeWorkflow({ id: 'wf-2', folderId: 'f-1' }),
      ]);
      mockedListFolders.mockResolvedValue([
        {
          id: 'f-1',
          name: 'ToDelete',
          parentFolderId: null,
          createdAt: new Date('2026-05-08T00:00:00Z'),
        },
        {
          id: 'f-1-child',
          name: 'Child',
          parentFolderId: 'f-1',
          createdAt: new Date('2026-05-08T00:00:00Z'),
        },
      ]);
      mockedListTags.mockResolvedValue([]);

      const user = userEvent.setup();
      renderWorkflows();

      await user.click(await screen.findByLabelText('Delete folder ToDelete'));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(/cannot be undone/i);
      // 1 sub-folder + 2 workflows in the cascade preview
      expect(dialog).toHaveTextContent('1');
      expect(dialog).toHaveTextContent('2');
    });
  });
});
