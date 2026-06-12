import { useMemo, useState } from 'react';
import type { StepStatus } from './StepSection';
import type { ConnectionStepMeta } from './StepLayoutContext';

export type StepId = 'connection' | 'configure' | 'test';

export interface ConfigStepsInput {
  /** null = the node has no connection step (skip + renumber). */
  connection: ConnectionStepMeta | null;
  /**
   * Configure-step validity. Defaults to true for forms that never report
   * validity (manual/cron/webhook nodes have no generically-detectable required
   * fields), so the Test step is never permanently locked. GenericConnectorForm
   * and opportunistically-migrated forms report real zod validity.
   */
  configureValid: boolean;
  /** A live test has succeeded for the current config. */
  tested: boolean;
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
  openStep: (id: StepId) => void;
}

export function useConfigSteps(input: ConfigStepsInput): UseConfigStepsResult {
  const { connection, configureValid, tested } = input;
  // null = "auto": follow the first-incomplete-unlocked rule. A user click sets
  // an explicit step, which only sticks while that step is unlocked.
  const [explicit, setExplicit] = useState<StepId | null>(null);

  const result = useMemo<UseConfigStepsResult>(() => {
    const order: StepId[] = connection
      ? ['connection', 'configure', 'test']
      : ['configure', 'test'];

    // An OPTIONAL connection is "complete" whenever no live selection is required
    // to run: explicitly cleared (none) OR a saved id that went stale — the node
    // still runs unauthenticated, so Test must NOT be locked. The amber
    // "Connection unavailable" warning still surfaces via `connectionSummary`,
    // which prioritises `stale`. A REQUIRED connection stays incomplete when
    // stale (no usable credential to run with).
    const connectionComplete =
      connection !== null && (connection.hasSelection || connection.optional);
    const configureComplete = configureValid;
    const testComplete = tested;

    const complete: Record<StepId, boolean> = {
      connection: connectionComplete,
      configure: configureComplete,
      test: testComplete,
    };

    // Test is locked until Configure is valid AND (no connection step or the
    // connection step is complete).
    const testLocked = !(configureValid && (connection === null || connectionComplete));
    const locked: Record<StepId, boolean> = {
      connection: false,
      configure: false,
      test: testLocked,
    };

    // Effective open: honor an explicit choice only when that step is unlocked,
    // otherwise fall back to auto = first incomplete unlocked step. When every
    // step is already complete (e.g. a tested node) Configure opens — the panel
    // is never all-collapsed, and Configure is never locked so this is safe.
    let openId: StepId;
    if (explicit !== null && !locked[explicit]) {
      openId = explicit;
    } else {
      openId = order.find((id) => !locked[id] && !complete[id]) ?? 'configure';
    }

    const steps: StepModel[] = order.map((id, i) => {
      let status: StepStatus;
      if (locked[id]) status = 'locked';
      else if (id === openId) status = 'active';
      else if (complete[id]) status = 'done';
      else status = 'pending';
      return { id, index: i + 1, status, open: id === openId };
    });

    return {
      steps,
      openStep: (id: StepId) => {
        if (locked[id]) return; // locked steps are not openable
        setExplicit(id);
      },
    };
  }, [connection, configureValid, tested, explicit]);

  return result;
}
