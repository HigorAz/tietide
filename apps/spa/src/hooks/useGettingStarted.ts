import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useExecutionsStore } from '@/stores/executionsStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import {
  isTourCompleted,
  isLibraryVisited,
  isChecklistDismissed,
  markChecklistDismissed,
} from '@/utils/tourStorage';

export interface GettingStartedItem {
  id: 'tour' | 'workflow' | 'connection' | 'run' | 'library';
  label: string;
  done: boolean;
  /** Route to navigate to when the row is actioned. */
  to?: string;
  /** Special action instead of navigation (start the first-access tour). */
  action?: 'tour';
}

export interface GettingStarted {
  items: GettingStartedItem[];
  completedCount: number;
  total: number;
  allDone: boolean;
  dismissed: boolean;
  dismiss: () => void;
}

/**
 * Derives the 5 first-run activation milestones. Most are read live from the
 * domain stores (accurate across devices); the rest come from per-user
 * localStorage flags. The checklist auto-completes as the user actually builds.
 */
export function useGettingStarted(): GettingStarted {
  const userId = useAuthStore((s) => s.user?.id);
  const workflows = useWorkflowsStore((s) => s.workflows);
  const connections = useConnectionsStore((s) => s.connections);
  const connectionsStatus = useConnectionsStore((s) => s.status);
  const fetchConnections = useConnectionsStore((s) => s.fetch);
  const executions = useExecutionsStore((s) => s.list);
  // Subscribing to tourRun re-renders the checklist when a tour ends, so the
  // localStorage-backed "tour" milestone reflects completion without a reload.
  useOnboardingStore((s) => s.tourRun);

  const [dismissed, setDismissed] = useState<boolean>(() =>
    userId ? isChecklistDismissed(userId) : false,
  );

  // The Home page doesn't otherwise load connections — fetch once so the
  // "Connect an app" milestone reflects reality.
  useEffect(() => {
    if (connectionsStatus === 'idle') void fetchConnections();
  }, [connectionsStatus, fetchConnections]);

  useEffect(() => {
    setDismissed(userId ? isChecklistDismissed(userId) : false);
  }, [userId]);

  const tourDone = userId ? isTourCompleted(userId) : false;
  const libraryDone = userId ? isLibraryVisited(userId) : false;

  const items: GettingStartedItem[] = [
    { id: 'tour', label: 'Take the product tour', done: tourDone, action: 'tour' },
    {
      id: 'workflow',
      label: 'Create your first workflow',
      done: workflows.length > 0,
      to: '/workflows',
    },
    { id: 'connection', label: 'Connect an app', done: connections.length > 0, to: '/connections' },
    { id: 'run', label: 'Run a workflow', done: executions.length > 0, to: '/workflows' },
    { id: 'library', label: 'Explore the library', done: libraryDone, to: '/library' },
  ];

  const completedCount = items.filter((i) => i.done).length;

  const dismiss = (): void => {
    if (userId) markChecklistDismissed(userId);
    setDismissed(true);
  };

  return {
    items,
    completedCount,
    total: items.length,
    allDone: completedCount === items.length,
    dismissed,
    dismiss,
  };
}
