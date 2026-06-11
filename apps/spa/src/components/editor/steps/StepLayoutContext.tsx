import { createContext, useContext, useEffect, type ReactNode } from 'react';

/**
 * Metadata a ConnectionPicker reports up to the panel so the panel can render
 * the Connection step header/summary and derive its completion state. The
 * picker is the single source of truth — the panel never reads connections
 * directly, it only consumes what the picker registers.
 */
export interface ConnectionStepMeta {
  /** Connection provider tag (e.g. 'google', 'http'). */
  provider: string;
  /** From the picker's `allowClear` — true = the connection is optional. */
  optional: boolean;
  /** Display name of the currently selected connection, or null. */
  selectedName: string | null;
  /** ConnectionStatus string of the selected connection, or null. */
  selectedStatus: string | null;
  /** A connection is currently selected (value resolves to a known connection). */
  hasSelection: boolean;
  /** A connectionId is saved but no longer resolves (deleted/revoked). */
  stale: boolean;
}

export interface StepLayoutValue {
  /** Step-1 body element supplied by the panel; the picker portals into it. */
  connectionSlot: HTMLElement | null;
  /** Picker calls this (idempotent-by-replace) whenever its meta changes. */
  registerConnection: (meta: ConnectionStepMeta) => void;
  /** Picker calls this on unmount only. */
  unregisterConnection: () => void;
  /** Configure-step validity reported by the active node form. */
  reportValidity: (valid: boolean) => void;
}

export const StepLayoutContext = createContext<StepLayoutValue | null>(null);

export function StepLayoutProvider({
  value,
  children,
}: {
  value: StepLayoutValue;
  children: ReactNode;
}): JSX.Element {
  return <StepLayoutContext.Provider value={value}>{children}</StepLayoutContext.Provider>;
}

/** Returns the surrounding step layout, or null when used outside the panel. */
export function useStepLayout(): StepLayoutValue | null {
  return useContext(StepLayoutContext);
}

/**
 * A node form calls this to report whether its Configure step is valid (so the
 * Test step can gate on it). Reports on every change of `valid`; no-op when
 * rendered outside a step layout.
 *
 * On unmount it reports `true` — the documented safe default (Test never
 * permanently locked). This makes the default self-enforcing: when an invalid
 * reporting form (e.g. GenericConnectorForm reporting `false`) is replaced by a
 * form that never reports validity, the cleanup clears the stale `false` so the
 * next node can't inherit a locked Test step. This no longer relies solely on
 * the parent's manual `setConfigureValid(true)` reset on `nodeId` change.
 */
export function useReportConfigValidity(valid: boolean): void {
  const layout = useStepLayout();
  useEffect(() => {
    if (!layout) return undefined;
    layout.reportValidity(valid);
    return () => {
      layout.reportValidity(true);
    };
  }, [layout, valid]);
}
