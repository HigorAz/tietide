import { useId, useState } from 'react';
import { docsCreateConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const isStringRecord = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function DocsCreateForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const templateId = asString(config.templateId);
  const replacements = isStringRecord(config.replacements) ? config.replacements : {};
  const mockOnDryRun = config.mockOnDryRun === true;

  const tmplId = useId();
  const replId = useId();
  const mockId = useId();

  const initialText = JSON.stringify(replacements, null, 2);
  const [replText, setReplText] = useState(initialText);
  const [replError, setReplError] = useState<string | null>(null);

  const parsed = docsCreateConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    templateId,
    replacements,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  const handleReplBlur = () => {
    try {
      const next = JSON.parse(replText);
      if (!isStringRecord(next) || !Object.values(next).every((v) => typeof v === 'string')) {
        setReplError('Replacements must be an object with string values.');
        return;
      }
      setReplError(null);
      updateNodeConfig(nodeId, { replacements: next });
    } catch {
      setReplError('Replacements is not valid JSON.');
    }
  };

  return (
    <div data-testid="docs-create-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="docs-create-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={tmplId} className={labelClass}>
          Template document ID
        </label>
        <DataPillInput
          id={tmplId}
          nodeId={nodeId}
          value={templateId}
          placeholder="1AbCdEf..."
          onChange={(next) => updateNodeConfig(nodeId, { templateId: next })}
        />
        {issueFor('templateId') && (
          <p data-testid="docs-create-template-error" role="alert" className="text-xs text-red-400">
            {issueFor('templateId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={replId} className={labelClass}>
          Replacements (JSON: tokens to values)
        </label>
        <textarea
          id={replId}
          value={replText}
          onChange={(e) => setReplText(e.target.value)}
          onBlur={handleReplBlur}
          rows={6}
          className={cn(inputClass, 'font-mono text-xs')}
          placeholder='{"name": "Alice", "amount": "$100"}'
        />
        <p className="text-xs text-text-muted">
          Tokens like <code>{'{{name}}'}</code> in the template will be replaced.
        </p>
        {replError && (
          <p data-testid="docs-create-repl-error" role="alert" className="text-xs text-red-400">
            {replError}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={mockId}
          type="checkbox"
          checked={mockOnDryRun}
          onChange={(e) => updateNodeConfig(nodeId, { mockOnDryRun: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={mockId} className="text-xs text-text-secondary">
          Skip Docs call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
