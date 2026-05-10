import { useId, type ReactNode } from 'react';
import type { ZodTypeAny } from 'zod';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';
import { ConnectionPicker } from '../ConnectionPicker';
import { DataPillInput } from './DataPillInput';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';

export type FieldSpec =
  | {
      kind: 'text' | 'pill';
      key: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      multiline?: boolean;
    }
  | {
      kind: 'select';
      key: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      required?: boolean;
    }
  | {
      kind: 'number';
      key: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      kind: 'checkbox';
      key: string;
      label: string;
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
const asNumberString = (v: unknown): string =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : '';

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

  // Build a candidate object for validation that drops empty optional values.
  const candidate: Record<string, unknown> = { connectionId: connectionId || undefined };
  for (const f of fields) {
    if (f.kind === 'checkbox') {
      candidate[f.key] = config[f.key] === true || undefined;
    } else if (f.kind === 'number') {
      const v = config[f.key];
      candidate[f.key] = typeof v === 'number' ? v : undefined;
    } else if (f.kind === 'select') {
      const v = asString(config[f.key]);
      candidate[f.key] = v || undefined;
    } else {
      const v = asString(config[f.key]);
      candidate[f.key] = v || undefined;
    }
  }
  if (showMockToggle) candidate.mockOnDryRun = mockOnDryRun || undefined;

  const parsed = schema.safeParse(candidate);
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');

  return (
    <div data-testid={testId} className="flex flex-col gap-4">
      {helpBanner}
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>{providerLabel} connection</span>
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

      {fields.map((f) => {
        const fieldId = `${testId}-${f.key}`;
        const issue = issueFor(f.key);
        if (f.kind === 'checkbox') {
          const checked = config[f.key] === true;
          return (
            <div key={f.key} className="flex items-center gap-2">
              <input
                id={fieldId}
                type="checkbox"
                checked={checked}
                onChange={(e) => updateNodeConfig(nodeId, { [f.key]: e.target.checked })}
                className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
              />
              <label htmlFor={fieldId} className="text-xs text-text-secondary">
                {f.label}
              </label>
            </div>
          );
        }
        if (f.kind === 'select') {
          const v = asString(config[f.key]);
          return (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className={labelClass}>
                {f.label}
                {!f.required && ' (optional)'}
              </label>
              <select
                id={fieldId}
                value={v}
                onChange={(e) => updateNodeConfig(nodeId, { [f.key]: e.target.value || undefined })}
                className={inputClass}
              >
                <option value="">— Select —</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {issue && (
                <p
                  data-testid={`${testId}-${f.key}-error`}
                  role="alert"
                  className="text-xs text-red-400"
                >
                  {issue}
                </p>
              )}
            </div>
          );
        }
        if (f.kind === 'number') {
          const v = asNumberString(config[f.key]);
          return (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className={labelClass}>
                {f.label}
                {!f.required && ' (optional)'}
              </label>
              <input
                id={fieldId}
                type="number"
                value={v}
                placeholder={f.placeholder}
                onChange={(e) => {
                  const n = e.target.value === '' ? undefined : Number(e.target.value);
                  updateNodeConfig(nodeId, { [f.key]: n });
                }}
                className={inputClass}
              />
              {issue && (
                <p
                  data-testid={`${testId}-${f.key}-error`}
                  role="alert"
                  className="text-xs text-red-400"
                >
                  {issue}
                </p>
              )}
            </div>
          );
        }
        const v = asString(config[f.key]);
        return (
          <div key={f.key} className="flex flex-col gap-1.5">
            <label htmlFor={fieldId} className={labelClass}>
              {f.label}
              {!f.required && ' (optional)'}
            </label>
            {f.kind === 'pill' ? (
              <DataPillInput
                id={fieldId}
                nodeId={nodeId}
                value={v}
                placeholder={f.placeholder}
                onChange={(next) => updateNodeConfig(nodeId, { [f.key]: next || undefined })}
              />
            ) : f.multiline ? (
              <textarea
                id={fieldId}
                value={v}
                rows={4}
                placeholder={f.placeholder}
                onChange={(e) => updateNodeConfig(nodeId, { [f.key]: e.target.value || undefined })}
                className={inputClass}
              />
            ) : (
              <input
                id={fieldId}
                type="text"
                value={v}
                placeholder={f.placeholder}
                onChange={(e) => updateNodeConfig(nodeId, { [f.key]: e.target.value || undefined })}
                className={inputClass}
              />
            )}
            {issue && (
              <p
                data-testid={`${testId}-${f.key}-error`}
                role="alert"
                className="text-xs text-red-400"
              >
                {issue}
              </p>
            )}
          </div>
        );
      })}

      {showMockToggle && (
        <div className="flex items-center gap-2">
          <input
            id={mockId}
            type="checkbox"
            checked={mockOnDryRun}
            onChange={(e) => updateNodeConfig(nodeId, { mockOnDryRun: e.target.checked })}
            className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
          />
          <label htmlFor={mockId} className="text-xs text-text-secondary">
            {mockToggleLabel ?? `Skip ${providerLabel} call on test runs (return mocked output)`}
          </label>
        </div>
      )}
    </div>
  );
}
