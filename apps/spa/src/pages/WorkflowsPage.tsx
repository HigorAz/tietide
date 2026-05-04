import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Workflow } from '@tietide/shared';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { WorkflowCard } from '@/components/dashboard/WorkflowCard';
import { NewWorkflowModal } from '@/components/dashboard/NewWorkflowModal';
import { DeleteWorkflowDialog } from '@/components/dashboard/DeleteWorkflowDialog';
import { useToastStore } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export function WorkflowsPage(): JSX.Element {
  const navigate = useNavigate();
  const { workflows, status, error, fetch, create, remove, toggleActive } = useWorkflowsStore();
  const toast = useToastStore((s) => s.show);

  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<Workflow | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const handleOpen = (id: string): void => {
    navigate(`/workflows/${id}`, { state: { from: '/workflows' } });
  };

  const handleToggle = async (id: string, next: boolean): Promise<void> => {
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      await toggleActive(id, next);
      toast({ tone: 'success', message: 'Workflow updated' });
    } catch (err) {
      // store reverts the optimistic update; surface the failure to the user.
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
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            New workflow
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">
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
            <p className="max-w-sm text-sm text-text-secondary">
              Workflows chain triggers and actions together. Create one to get started.
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                onOpen={handleOpen}
                onToggle={handleToggle}
                onDelete={(id) => {
                  const target = workflows.find((w) => w.id === id) ?? null;
                  setToDelete(target);
                }}
                isToggling={togglingIds.has(wf.id)}
                isDeleting={deletingIds.has(wf.id)}
              />
            ))}
          </div>
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
