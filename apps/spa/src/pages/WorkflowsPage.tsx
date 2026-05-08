import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import type { Workflow } from '@tietide/shared';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { WorkflowRow } from '@/components/dashboard/WorkflowRow';
import { NewWorkflowModal } from '@/components/dashboard/NewWorkflowModal';
import { DeleteWorkflowDialog } from '@/components/dashboard/DeleteWorkflowDialog';
import { ImportWorkflowButton } from '@/components/dashboard/ImportWorkflowButton';
import { useToastStore } from '@/stores/toastStore';
import { getWorkflowDocs, regenerateWorkflowDocs } from '@/api/ai';
import { cn } from '@/utils/cn';

interface RowDocsState {
  isExpanded: boolean;
  isGenerating: boolean;
  content: string | null;
  error: string | null;
}

const emptyRowDocs: RowDocsState = {
  isExpanded: false,
  isGenerating: false,
  content: null,
  error: null,
};

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export function WorkflowsPage(): JSX.Element {
  const navigate = useNavigate();
  const { workflows, status, error, fetch, create, remove, toggleActive, setDocumentationMeta } =
    useWorkflowsStore();
  const toast = useToastStore((s) => s.show);

  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<Workflow | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [docsByWorkflow, setDocsByWorkflow] = useState<Record<string, RowDocsState>>({});

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const updateRowDocs = (id: string, patch: Partial<RowDocsState>): void => {
    setDocsByWorkflow((prev) => ({
      ...prev,
      [id]: { ...emptyRowDocs, ...prev[id], ...patch },
    }));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter((w) => w.name.toLowerCase().includes(q));
  }, [workflows, query]);

  const handleOpen = (id: string): void => {
    navigate(`/workflows/${id}`, { state: { from: '/workflows' } });
  };

  const handleToggle = async (id: string, next: boolean): Promise<void> => {
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      await toggleActive(id, next);
      toast({ tone: 'success', message: 'Workflow updated' });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not update workflow') });
    } finally {
      setTogglingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(id);
        return nextSet;
      });
    }
  };

  const handleCreate = async (body: Parameters<typeof create>[0]): Promise<void> => {
    try {
      const created = await create(body);
      toast({ tone: 'success', message: 'Workflow created' });
      setShowCreate(false);
      navigate(`/workflows/${created.id}`, { state: { from: '/workflows' } });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not create workflow') });
      throw err;
    }
  };

  const handleImported = (created: Workflow): void => {
    void fetch();
    navigate(`/workflows/${created.id}`, { state: { from: '/workflows' } });
  };

  const handleDeleteConfirm = async (id: string): Promise<void> => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await remove(id);
      toast({ tone: 'success', message: 'Workflow deleted' });
      setToDelete(null);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not delete workflow') });
    } finally {
      setDeletingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(id);
        return nextSet;
      });
    }
  };

  const regenerateDocs = async (id: string): Promise<void> => {
    updateRowDocs(id, { isGenerating: true, error: null });
    try {
      const response = await regenerateWorkflowDocs(id);
      updateRowDocs(id, {
        isGenerating: false,
        content: response.documentation,
        error: null,
        isExpanded: true,
      });
      setDocumentationMeta(id, {
        generatedAt: new Date(response.generatedAt),
        version: response.version,
      });
    } catch (err) {
      updateRowDocs(id, {
        isGenerating: false,
        error: errorMessage(err, 'Could not generate documentation'),
        isExpanded: true,
      });
    }
  };

  const viewDocs = async (id: string): Promise<void> => {
    updateRowDocs(id, { isGenerating: true, error: null });
    try {
      const response = await getWorkflowDocs(id);
      if (!response) {
        updateRowDocs(id, {
          isGenerating: false,
          content: null,
          error: 'Documentation not available yet. Click Generate to create it.',
          isExpanded: true,
        });
        return;
      }
      updateRowDocs(id, {
        isGenerating: false,
        content: response.documentation,
        error: null,
        isExpanded: true,
      });
      setDocumentationMeta(id, {
        generatedAt: new Date(response.generatedAt),
        version: response.version,
      });
    } catch (err) {
      updateRowDocs(id, {
        isGenerating: false,
        error: errorMessage(err, 'Could not load documentation'),
        isExpanded: true,
      });
    }
  };

  const handleGenerateDocs = (id: string): void => {
    void regenerateDocs(id);
  };

  const handleToggleDocsExpanded = (id: string): void => {
    const state = docsByWorkflow[id] ?? emptyRowDocs;
    if (state.isExpanded) {
      updateRowDocs(id, { isExpanded: false });
      return;
    }
    updateRowDocs(id, { isExpanded: true });
    if (!state.content) {
      void viewDocs(id);
    }
  };

  const isFiltering = query.trim().length > 0;

  return (
    <div className="flex flex-col">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Workflows</h1>
            <p className="text-xs text-text-secondary">
              Build, automate, and monitor your integrations.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <label className="relative flex flex-1 items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search workflows…"
              aria-label="Search workflows"
              className={cn(
                'w-full rounded-md border border-white/5 bg-elevated py-2 pl-9 pr-3',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
              )}
            />
          </label>
          <ImportWorkflowButton variant="secondary" onImported={handleImported} />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            New workflow
          </button>
        </div>

        {status === 'loading' && workflows.length === 0 && (
          <p className="text-sm text-text-secondary">Loading workflows…</p>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            <p>{error ?? 'Something went wrong'}</p>
            <button
              type="button"
              onClick={() => void fetch()}
              className="rounded-md bg-error/20 px-3 py-1 text-xs font-semibold text-error transition hover:bg-error/30"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && workflows.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/10 bg-surface/40 p-12 text-center">
            <h2 className="text-base font-semibold text-text-primary">No workflows yet</h2>
            <p className="max-w-md text-sm text-text-secondary">
              No workflows yet — start from the{' '}
              <Link
                to="/library"
                className="font-semibold text-accent-teal hover:text-accent-teal-hover"
              >
                Library
              </Link>{' '}
              or build from scratch.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
                'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
              )}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create your first workflow
            </button>
          </div>
        )}

        {workflows.length > 0 && (
          <>
            {isFiltering && filtered.length === 0 && (
              <p className="text-sm text-text-secondary">No workflows match “{query}”.</p>
            )}
            <ul aria-label="Workflows" className="flex flex-col gap-3">
              {filtered.map((wf) => {
                const docs = docsByWorkflow[wf.id] ?? emptyRowDocs;
                return (
                  <WorkflowRow
                    key={wf.id}
                    workflow={wf}
                    isExpanded={docs.isExpanded}
                    isGeneratingDocs={docs.isGenerating}
                    docsContent={docs.content}
                    docsError={docs.error}
                    onOpen={handleOpen}
                    onToggleActive={handleToggle}
                    onDelete={(id) => {
                      const target = workflows.find((w) => w.id === id) ?? null;
                      setToDelete(target);
                    }}
                    onGenerateDocs={handleGenerateDocs}
                    onToggleDocsExpanded={handleToggleDocsExpanded}
                    isToggling={togglingIds.has(wf.id)}
                    isDeleting={deletingIds.has(wf.id)}
                  />
                );
              })}
            </ul>
          </>
        )}
      </main>

      {showCreate && (
        <NewWorkflowModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}

      {toDelete && (
        <DeleteWorkflowDialog
          workflow={toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}

export default WorkflowsPage;
