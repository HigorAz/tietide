import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useExecutionsStore } from '@/stores/executionsStore';
import { useToastStore } from '@/stores/toastStore';
import { NewWorkflowModal } from '@/components/dashboard/NewWorkflowModal';
import { HomeGreeting } from '@/components/home/HomeGreeting';
import { QuickActionsRow } from '@/components/home/QuickActionsRow';
import { RecentActivitySection } from '@/components/home/RecentActivitySection';
import { RecentWorkflowsSection } from '@/components/home/RecentWorkflowsSection';
import { HomeEmptyState } from '@/components/home/HomeEmptyState';
import type { CreateWorkflowBody } from '@/api/workflows';

const RECENT_WORKFLOWS_LIMIT = 3;
const RECENT_ACTIVITY_PAGE_SIZE = 5;

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const updatedAtMs = (date: Date | string): number => {
  const d = date instanceof Date ? date : new Date(date);
  return d.getTime();
};

export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const workflows = useWorkflowsStore((s) => s.workflows);
  const fetchWorkflows = useWorkflowsStore((s) => s.fetch);
  const createWorkflow = useWorkflowsStore((s) => s.create);
  const executions = useExecutionsStore((s) => s.list);
  const executionsStatus = useExecutionsStore((s) => s.listStatus);
  const executionsError = useExecutionsStore((s) => s.listError);
  const fetchExecutions = useExecutionsStore((s) => s.fetchList);
  const toast = useToastStore((s) => s.show);

  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    void fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    void fetchExecutions({ pageSize: RECENT_ACTIVITY_PAGE_SIZE });
  }, [fetchExecutions]);

  const recentWorkflows = useMemo(
    () =>
      [...workflows]
        .sort((a, b) => updatedAtMs(b.updatedAt) - updatedAtMs(a.updatedAt))
        .slice(0, RECENT_WORKFLOWS_LIMIT),
    [workflows],
  );

  const isEmpty = workflows.length === 0 && executions.length === 0;

  const handleCreate = async (body: CreateWorkflowBody): Promise<void> => {
    try {
      const created = await createWorkflow(body);
      toast({ tone: 'success', message: 'Workflow created' });
      setShowCreate(false);
      navigate(`/workflows/${created.id}`);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not create workflow') });
      throw err;
    }
  };

  return (
    <div className="flex flex-col">
      <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8">
        <HomeGreeting name={user?.name} email={user?.email} />

        <QuickActionsRow onCreateWorkflow={() => setShowCreate(true)} />

        {isEmpty ? (
          <HomeEmptyState />
        ) : (
          <>
            <RecentActivitySection
              executions={executions}
              workflows={workflows}
              status={executionsStatus}
              error={executionsError}
            />
            {recentWorkflows.length > 0 && <RecentWorkflowsSection workflows={recentWorkflows} />}
          </>
        )}
      </main>

      {showCreate && (
        <NewWorkflowModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}

export default HomePage;
