import { OLLAMA_EMBEDDING_MODELS, OLLAMA_TEXT_MODELS } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import { DataPillInput } from './DataPillInput';
import { FieldLabel } from './FieldLabel';
import { OllamaModelSelect } from './ollama/OllamaModelSelect';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { FieldSpec } from './GenericConnectorForm';

const inputClass = cn(
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNumberString = (v: unknown): string =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : '';

export interface GenericFieldRowProps {
  field: FieldSpec;
  fieldId: string;
  testId: string;
  config: Record<string, unknown>;
  nodeId: string;
  issue: string | null;
}

const FieldError = ({ id, message }: { id: string; message: string }): JSX.Element => (
  <p data-testid={id} role="alert" className="text-xs text-red-400">
    {message}
  </p>
);

/**
 * Renders a single GenericConnectorForm field by kind, using the shared
 * FieldLabel and ToggleSwitch primitives (sentence-case labels, switches).
 */
export function GenericFieldRow({
  field: f,
  fieldId,
  testId,
  config,
  nodeId,
  issue,
}: GenericFieldRowProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  if (f.kind === 'checkbox') {
    return (
      <ToggleSwitch
        id={fieldId}
        checked={config[f.key] === true}
        onChange={(next) => updateNodeConfig(nodeId, { [f.key]: next })}
        label={f.label}
        description={f.description}
      />
    );
  }

  if (f.kind === 'ollama-model') {
    const v = asString(config[f.key]);
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={fieldId} label={f.label} required={f.required} help={f.help} />
        <OllamaModelSelect
          id={fieldId}
          connectionId={asString(config.connectionId) || undefined}
          value={v}
          onChange={(next) => updateNodeConfig(nodeId, { [f.key]: next || undefined })}
          curated={f.modelKind === 'embedding' ? OLLAMA_EMBEDDING_MODELS : OLLAMA_TEXT_MODELS}
          allowBlank
        />
        {issue && <FieldError id={`${testId}-${f.key}-error`} message={issue} />}
      </div>
    );
  }

  if (f.kind === 'select') {
    const v = asString(config[f.key]);
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={fieldId} label={f.label} required={f.required} help={f.help} />
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
        {issue && <FieldError id={`${testId}-${f.key}-error`} message={issue} />}
      </div>
    );
  }

  if (f.kind === 'number') {
    const v = asNumberString(config[f.key]);
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={fieldId} label={f.label} required={f.required} help={f.help} />
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
        {issue && <FieldError id={`${testId}-${f.key}-error`} message={issue} />}
      </div>
    );
  }

  const v = asString(config[f.key]);
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={fieldId} label={f.label} required={f.required} help={f.help} />
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
      {issue && <FieldError id={`${testId}-${f.key}-error`} message={issue} />}
    </div>
  );
}
