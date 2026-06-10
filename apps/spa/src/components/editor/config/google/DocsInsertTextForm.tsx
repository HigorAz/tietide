import { useId } from 'react';
import { docsInsertTextConfigSchema } from '@tietide/shared';
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

export function DocsInsertTextForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const documentId = asString(config.documentId);
  const text = asString(config.text);
  const index = typeof config.index === 'number' ? config.index : undefined;
  const mockOnDryRun = config.mockOnDryRun === true;

  const documentField = useId();
  const textField = useId();
  const indexField = useId();
  const mockId = useId();

  const parsed = docsInsertTextConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    documentId,
    text,
    index,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const documentIssue = issueFor('documentId');
  const textIssue = issueFor('text');
  const indexIssue = issueFor('index');

  return (
    <div data-testid="docs-insert-text-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connectionIssue && (
          <p role="alert" className="text-xs text-red-400">
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={documentField} className={labelClass}>
          Document ID
        </label>
        <DataPillInput
          id={documentField}
          nodeId={nodeId}
          value={documentId}
          placeholder="1AbC..."
          aria-invalid={documentIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { documentId: next })}
        />
        {documentIssue && (
          <p role="alert" className="text-xs text-red-400">
            {documentIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={textField} className={labelClass}>
          Text to insert
        </label>
        <DataPillInput
          id={textField}
          nodeId={nodeId}
          value={text}
          placeholder="Text to insert"
          aria-invalid={textIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { text: next })}
        />
        {textIssue && (
          <p role="alert" className="text-xs text-red-400">
            {textIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={indexField} className={labelClass}>
          Insert at index (optional — blank appends to end)
        </label>
        <input
          id={indexField}
          type="number"
          min={1}
          value={index ?? ''}
          placeholder="append to end"
          aria-invalid={indexIssue !== null}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { index: undefined });
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) updateNodeConfig(nodeId, { index: n });
          }}
          className={inputClass}
        />
        {indexIssue && (
          <p role="alert" className="text-xs text-red-400">
            {indexIssue}
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
