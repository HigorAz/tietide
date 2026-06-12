import { useCallback, useMemo, useRef, useState, type ComponentType } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { NodeConfigFormProps } from '../config/formRegistry';
import { NodePreviewPanel } from '../preview/NodePreviewPanel';
import { TestStep } from './TestStep';
import {
  StepLayoutProvider,
  type ConnectionStepMeta,
  type StepLayoutValue,
} from './StepLayoutContext';
import { StepSection } from './StepSection';
import { useConfigSteps, type StepId, type StepModel } from './useConfigSteps';
import { connectionSummary, configureSummary } from './stepSummaries';

export interface ConfigStepsProps {
  nodeId: string;
  config: Record<string, unknown>;
  /** From FORM_REGISTRY — rendered UNCHANGED inside the Configure step (REQ-C5). */
  Form: ComponentType<NodeConfigFormProps> | undefined;
}

const STEP_TITLES: Record<StepId, string> = {
  connection: 'Connection',
  configure: 'Configure',
  test: 'Test',
};

const ERROR_HANDLER_DESCRIPTION =
  'Reveals a red output handle. Connect it to route execution down an error path when this node fails.';

/** Shallow field equality for ConnectionStepMeta — avoids re-registration churn. */
const connectionMetaEqual = (a: ConnectionStepMeta, b: ConnectionStepMeta): boolean =>
  a.provider === b.provider &&
  a.optional === b.optional &&
  a.selectedName === b.selectedName &&
  a.selectedStatus === b.selectedStatus &&
  a.hasSelection === b.hasSelection &&
  a.stale === b.stale;

/**
 * The stepped Configure view (sketch 003-D). Owns the StepLayoutValue — the
 * connection slot element, the connection meta a ConnectionPicker registers, and
 * the Configure-step validity a form reports — and derives the gated numbered
 * step list via `useConfigSteps`.
 *
 * Critical correctness rule (the blocker this plan fixes): the Form lives in the
 * Configure step body and is what renders the ConnectionPicker, which both
 * registers the Connection step and portals into the connection slot. So BOTH
 * the Connection and Configure step bodies render with `keepMounted` — their
 * bodies stay mounted (hidden) across collapse, so registration never
 * oscillates and a saved node renders all 3 steps with 1-2 done on first paint.
 * `connectionMeta`/`configureValid` are owned here and reset only on `nodeId`
 * change — never cleared by a collapse.
 */
export function ConfigSteps({ nodeId, config, Form }: ConfigStepsProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const [connectionMeta, setConnectionMeta] = useState<ConnectionStepMeta | null>(null);
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const [configureValid, setConfigureValid] = useState(true);
  // `tested` + its summary are driven by a successful live run from the Test step.
  const [tested, setTested] = useState(false);
  const [testSummary, setTestSummary] = useState<string | null>(null);

  // Reset owned state when the active node changes (never on a transient collapse —
  // keepMounted means there is no transient unmount).
  const prevNodeId = useRef(nodeId);
  if (prevNodeId.current !== nodeId) {
    prevNodeId.current = nodeId;
    setConnectionMeta(null);
    setConfigureValid(true);
    setTested(false);
    setTestSummary(null);
  }

  const handleTestResult = useCallback((r: { ok: boolean; summary: string }) => {
    setTested(r.ok);
    setTestSummary(r.ok ? r.summary : null);
  }, []);

  // Guard against churn: the picker registers primitive-derived meta, but a
  // shallow-equal-but-new object still triggers a useConfigSteps recompute via
  // setState. Skip the update when every field is unchanged (IN-01).
  const registerConnection = useCallback(
    (meta: ConnectionStepMeta) =>
      setConnectionMeta((prev) => (prev && connectionMetaEqual(prev, meta) ? prev : meta)),
    [],
  );
  const unregisterConnection = useCallback(() => setConnectionMeta(null), []);
  const reportValidity = useCallback((valid: boolean) => setConfigureValid(valid), []);

  const layoutValue = useMemo<StepLayoutValue>(
    () => ({
      connectionSlot: slotEl,
      registerConnection,
      unregisterConnection,
      reportValidity,
    }),
    [slotEl, registerConnection, unregisterConnection, reportValidity],
  );

  const { steps, openStep } = useConfigSteps({
    connection: connectionMeta,
    configureValid,
    tested,
  });

  const hasErrorHandler = config.hasErrorHandler === true;
  const configureIndex = steps.find((s) => s.id === 'configure')?.index ?? 1;

  const renderBody = (step: StepModel): JSX.Element => {
    switch (step.id) {
      case 'connection':
        return <div ref={setSlotEl} data-testid="connection-step-slot" />;
      case 'configure':
        return (
          <div className="flex flex-col gap-4">
            {Form ? (
              <Form key={nodeId} nodeId={nodeId} config={config} />
            ) : (
              <p className="text-sm text-text-muted">No configuration available for this node.</p>
            )}

            <ToggleSwitch
              id={`error-handler-${nodeId}`}
              data-testid="node-config-error-handler-toggle"
              checked={hasErrorHandler}
              onChange={(next) => updateNodeConfig(nodeId, { hasErrorHandler: next })}
              label="Add error handler"
              description={ERROR_HANDLER_DESCRIPTION}
            />

            <NodePreviewPanel nodeId={nodeId} />

            {configureValid && (
              <button
                type="button"
                onClick={() => openStep('test')}
                className="self-start rounded-md bg-accent-teal px-3.5 py-2 text-xs font-semibold text-text-primary transition hover:bg-accent-teal-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
              >
                Continue
              </button>
            )}
          </div>
        );
      case 'test':
        return (
          <TestStep
            nodeId={nodeId}
            onFixInConfigure={() => openStep('configure')}
            onResult={handleTestResult}
          />
        );
    }
  };

  const summaryFor = (step: StepModel): string | undefined => {
    if (step.id === 'connection' && connectionMeta) {
      const selected =
        connectionMeta.selectedName !== null
          ? {
              name: connectionMeta.selectedName,
              status: connectionMeta.selectedStatus ?? '',
            }
          : null;
      return connectionSummary(selected, {
        optional: connectionMeta.optional,
        stale: connectionMeta.stale,
      });
    }
    if (step.id === 'configure') return configureSummary(config);
    if (step.id === 'test') {
      if (step.status === 'locked') return `Finish step ${configureIndex} first`;
      if (tested && testSummary) return `✓ tested · ${testSummary}`;
      return 'Run a live test to capture sample output';
    }
    return undefined;
  };

  return (
    <StepLayoutProvider value={layoutValue}>
      <div className="flex flex-col gap-4">
        {steps.map((step) => (
          <StepSection
            key={step.id}
            data-testid={`config-step-${step.id}`}
            index={step.index}
            title={STEP_TITLES[step.id]}
            status={step.status}
            summary={summaryFor(step)}
            open={step.open}
            onToggle={() => openStep(step.id)}
            keepMounted={step.id !== 'test'}
          >
            {renderBody(step)}
          </StepSection>
        ))}
      </div>
    </StepLayoutProvider>
  );
}
