import { useCallback, useMemo, useState } from 'react';
import type { StepStatus } from './StepSection';
import type { ConnectionStepMeta } from './StepLayoutContext';

export type StepId = 'connection' | 'configure' | 'test';

export interface ConfigStepsInput {
  /** null = the node has no connection step (skip + renumber). */
  connection: ConnectionStepMeta | null;
  /**
   * Configure-step validity. Defaults to true for forms that never report
   * validity (manual/cron/webhook nodes have no generically-detectable required
   * fields). Drives the Configure step's done-vs-active state (and, in the panel,
   * whether the Test button is enabled). GenericConnectorForm and
   * opportunistically-migrated forms report real zod validity.
   */
  configureValid: boolean;
  /** A live test has succeeded for the current config. */
  tested: boolean;
  /**
   * The configuration changed since the last successful test. Re-arms the Test
   * step (it is no longer "done", shows as active) so the user re-tests to
   * refresh the captured sample output.
   */
  dirty?: boolean;
}

export interface StepModel {
  id: StepId;
  /** 1-based position AFTER skipping the connection step (REQ-C1 renumbering). */
  index: number;
  status: StepStatus;
  open: boolean;
}

export interface UseConfigStepsResult {
  steps: StepModel[];
  /** Flip a single step's collapsed state (header click). */
  toggleStep: (id: StepId) => void;
  /** Ensure a step is expanded (e.g. ErrorCard "Fix in Configure"). */
  expandStep: (id: StepId) => void;
}

/**
 * Derives the numbered Connection → Configure → Test step list for the node
 * config panel. Every step renders OPEN by default so the whole node is editable
 * at a glance; a user can collapse/expand any step independently via its header
 * (tracked in `collapsed`). Steps never lock — an incomplete step shows as
 * 'active' and a completed one as 'done' (green ✓ bubble). The Test step's
 * run-readiness guard lives in the panel/TestStep (button disabled until the
 * config is valid), not in a step-level lock.
 */
export function useConfigSteps(input: ConfigStepsInput): UseConfigStepsResult {
  const { connection, configureValid, tested, dirty = false } = input;
  // Steps the user has explicitly collapsed; empty = all open (the default).
  const [collapsed, setCollapsed] = useState<Set<StepId>>(() => new Set());

  const toggleStep = useCallback((id: StepId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandStep = useCallback((id: StepId) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const steps = useMemo<StepModel[]>(() => {
    const order: StepId[] = connection
      ? ['connection', 'configure', 'test']
      : ['configure', 'test'];

    // An OPTIONAL connection is "complete" whenever no live selection is required
    // to run: a selection, or none/stale on an optional connection (the node still
    // runs unauthenticated — the amber "Connection unavailable" warning surfaces
    // via `connectionSummary`). A REQUIRED connection stays incomplete when stale.
    const connectionComplete =
      connection !== null && (connection.hasSelection || connection.optional);
    // A pending edit since the last test re-arms the Test step (no longer done).
    const complete: Record<StepId, boolean> = {
      connection: connectionComplete,
      configure: configureValid,
      test: tested && !dirty,
    };

    return order.map((id, i) => ({
      id,
      index: i + 1,
      status: (complete[id] ? 'done' : 'active') as StepStatus,
      open: !collapsed.has(id),
    }));
  }, [connection, configureValid, tested, dirty, collapsed]);

  return { steps, toggleStep, expandStep };
}
