import { useId, type ReactNode } from 'react';
import type { ZodTypeAny } from 'zod';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from './formRegistry';
import { ConnectionPicker } from '../ConnectionPicker';
import { FieldLabel } from './FieldLabel';
import { GenericFieldRow } from './GenericFieldRow';
import { OptionsSection } from './OptionsSection';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useStepLayout, useReportConfigValidity } from '../steps/StepLayoutContext';

export type FieldSpec =
  | {
      kind: 'text' | 'pill';
      key: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      multiline?: boolean;
      help?: string;
      /** Set false to disable the literal⇄expression "fx" toggle on a text field. */
      fx?: boolean;
    }
  | {
      kind: 'select';
      key: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      required?: boolean;
      help?: string;
      /** Set false to disable the fx toggle (selects are fx-capable by default). */
      fx?: boolean;
    }
  | {
      kind: 'number';
      key: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      help?: string;
      /** Set false to disable the fx toggle (numbers are fx-capable by default). */
      fx?: boolean;
    }
  | {
      kind: 'checkbox';
      key: string;
      label: string;
      help?: string;
      description?: string;
    }
  | {
      kind: 'ollama-model';
      key: string;
      label: string;
      modelKind: 'text' | 'embedding';
      required?: boolean;
      help?: string;
    };

export interface GenericConnectorFormProps extends NodeConfigFormProps {
  testId: string;
  provider: string;
  providerLabel: string;
  schema: ZodTypeAny;
  fields: ReadonlyArray<FieldSpec>;
  showMockToggle?: boolean;
  mockToggleLabel?: string;
  helpBanner?: ReactNode;
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const isRequiredField = (f: FieldSpec): boolean => f.kind !== 'checkbox' && f.required === true;

export function GenericConnectorForm({
  nodeId,
  config,
  testId,
  provider,
  providerLabel,
  schema,
  fields,
  showMockToggle = true,
  mockToggleLabel,
  helpBanner,
}: GenericConnectorFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const mockOnDryRun = config.mockOnDryRun === true;
  const mockId = useId();

  // A field in fx/expression mode holds a `{{pill}}` template that resolves only
  // at run time, so it can't be validated against the literal schema here — the
  // worker validates the resolved value. Skip such fields client-side (don't
  // include them in the candidate, and suppress their issues below).
  const isExprField = (key: string): boolean => {
    const v = config[key];
    return typeof v === 'string' && v.includes('{{');
  };

  // Build a candidate object for validation that drops empty optional values.
  const candidate: Record<string, unknown> = { connectionId: connectionId || undefined };
  for (const f of fields) {
    if (isExprField(f.key)) {
      candidate[f.key] = undefined; // validated at run time, not here
    } else if (f.kind === 'checkbox') {
      candidate[f.key] = config[f.key] === true || undefined;
    } else if (f.kind === 'number') {
      const v = config[f.key];
      candidate[f.key] = typeof v === 'number' ? v : undefined;
    } else {
      const v = asString(config[f.key]);
      candidate[f.key] = v || undefined;
    }
  }
  if (showMockToggle) candidate.mockOnDryRun = mockOnDryRun || undefined;

  const parsed = schema.safeParse(candidate);
  const issueFor = (field: string): string | null => {
    if (isExprField(field)) return null; // expression fields validate at run time
    return parsed.success
      ? null
      : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  };

  const connIssue = issueFor('connectionId');

  // Configure validity ignores connectionId problems (the connection lives in
  // step 1) and any expression-mode field (resolved + validated at run time), so
  // neither permanently locks Test.
  const layout = useStepLayout();
  const configureValid =
    parsed.success ||
    parsed.error.issues.every(
      (i) => i.path[0] === 'connectionId' || isExprField(String(i.path[0])),
    );
  useReportConfigValidity(configureValid);

  const requiredFields = fields.filter(isRequiredField);
  const optionalFields = fields.filter((f) => !isRequiredField(f));

  // Optional fields + the mock toggle live inside the collapsed Options group.
  const optionCount = optionalFields.length + (showMockToggle ? 1 : 0);
  const optionsMeta = `${optionCount} option${optionCount === 1 ? '' : 's'} · defaults`;

  return (
    <div data-testid={testId} className="flex flex-col gap-4">
      {helpBanner}
      {layout ? (
        // Inside the step panel the label + error live in the Connection step,
        // so the picker carries the error and renders no surrounding chrome.
        <ConnectionPicker
          provider={provider}
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
          errorMessage={connIssue ? `Select a ${providerLabel} connection.` : null}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={`${providerLabel} connection`} />
          <ConnectionPicker
            provider={provider}
            value={connectionId || null}
            onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
          />
          {connIssue && (
            <p
              data-testid={`${testId}-connection-error`}
              role="alert"
              className="text-xs text-red-400"
            >
              Select a {providerLabel} connection.
            </p>
          )}
        </div>
      )}

      {requiredFields.map((f) => (
        <GenericFieldRow
          key={f.key}
          field={f}
          fieldId={`${testId}-${f.key}`}
          testId={testId}
          config={config}
          nodeId={nodeId}
          issue={issueFor(f.key)}
        />
      ))}

      {optionCount > 0 && (
        <OptionsSection meta={optionsMeta} data-testid={`${testId}-options`}>
          {optionalFields.map((f) => (
            <GenericFieldRow
              key={f.key}
              field={f}
              fieldId={`${testId}-${f.key}`}
              testId={testId}
              config={config}
              nodeId={nodeId}
              issue={issueFor(f.key)}
            />
          ))}
          {showMockToggle && (
            <ToggleSwitch
              id={mockId}
              checked={mockOnDryRun}
              onChange={(next) => updateNodeConfig(nodeId, { mockOnDryRun: next })}
              label={
                mockToggleLabel ?? `Skip ${providerLabel} call on test runs (return mocked output)`
              }
            />
          )}
        </OptionsSection>
      )}
    </div>
  );
}
