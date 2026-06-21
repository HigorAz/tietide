import { useCallback, useMemo, useRef, useState, type ComponentType } from 'react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
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

// Config keys that do NOT represent a tested-output-affecting change: the
// persisted sample itself, and the error-handler toggle (a routing concern, not
// an input). Edits to anything else re-arm the Test step.
const TEST_INVARIANT_KEYS = new Set<string>([PILL_SAMPLE_KEY, 'hasErrorHandler']);

const hasPillSample = (config: Record<string, unknown>): boolean =>
  config[PILL_SAMPLE_KEY] !== undefined;

/** Order-independent fingerprint of the config that actually affects a test run. */
const configFingerprint = (config: Record<string, unknown>): string => {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = stable((value as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return value;
  };
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (!TEST_INVARIANT_KEYS.has(k)) stripped[k] = v;
  }
  return JSON.stringify(stable(stripped));
};

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
  // Result of a *live* test run this session. 'none' until the user runs one;
  // a prior tested node is recognised separately via its persisted pill sample.
  const [liveResult, setLiveResult] = useState<'none' | 'ok' | 'fail'>('none');
  const [testSummary, setTestSummary] = useState<string | null>(null);

  // The config fingerprint captured at the last known-good test. Seeded from the
  // persisted sample on load so a re-opened tested node starts clean (not dirty),
  // and refreshed after every successful live run.
  const snapshotRef = useRef<string | null>(
    hasPillSample(config) ? configFingerprint(config) : null,
  );
  // Latest config, readable from the (memoised) test-result callback.
  const configRef = useRef(config);
  configRef.current = config;

  // Reset owned state when the active node changes (never on a transient collapse —
  // keepMounted means there is no transient unmount).
  const prevNodeId = useRef(nodeId);
  if (prevNodeId.current !== nodeId) {
    prevNodeId.current = nodeId;
    setConnectionMeta(null);
    setConfigureValid(true);
    setLiveResult('none');
    setTestSummary(null);
    snapshotRef.current = hasPillSample(config) ? configFingerprint(config) : null;
  }

  const handleTestResult = useCallback((r: { ok: boolean; summary: string }) => {
    setLiveResult(r.ok ? 'ok' : 'fail');
    setTestSummary(r.ok ? r.summary : null);
    if (r.ok) snapshotRef.current = configFingerprint(configRef.current);
  }, []);

  // A node is "ever tested" if it carries a persisted sample OR a live run just
  // succeeded — that flips the panel into the all-steps-expanded editing layout.
  const everTested = hasPillSample(config) || liveResult === 'ok';
  // Config changed since the last good test → re-arm Test + re-show Continue.
  const dirty =
    everTested && snapshotRef.current !== null && snapshotRef.current !== configFingerprint(config);
  // The Test step shows "done" unless the last live run failed.
  const testedDone = liveResult === 'fail' ? false : everTested;

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

  const { steps, toggleStep, expandStep } = useConfigSteps({
    connection: connectionMeta,
    configureValid,
    tested: testedDone,
    dirty,
  });

  // Test-run readiness. The step is always shown (never locked), but the run
  // button stays disabled — with an explanatory tooltip — until the config is
  // valid and any required connection is chosen. An optional/stale connection
  // still counts as ready (the node runs unauthenticated).
  const connectionComplete =
    connectionMeta === null || connectionMeta.hasSelection || connectionMeta.optional;
  const testReady = configureValid && connectionComplete;
  const testNotReadyReason = !configureValid
    ? 'Complete the Configure step first'
    : !connectionComplete
      ? 'Choose a connection first'
      : null;

  const hasErrorHandler = config.hasErrorHandler === true;

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

            {dirty && (
              <p className="text-xs text-status-warning">
                Configuration changed — re-test to refresh the captured sample output.
              </p>
            )}
          </div>
        );
      case 'test':
        return (
          <TestStep
            nodeId={nodeId}
            ready={testReady}
            notReadyReason={testNotReadyReason}
            onFixInConfigure={() => expandStep('configure')}
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
      if (dirty) return 'Configuration changed — re-test to refresh sample output';
      if (testSummary) return `✓ tested · ${testSummary}`;
      if (testedDone) return '✓ tested · sample output captured';
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
            onToggle={() => toggleStep(step.id)}
            keepMounted={step.id !== 'test'}
          >
            {renderBody(step)}
          </StepSection>
        ))}
      </div>
    </StepLayoutProvider>
  );
}
