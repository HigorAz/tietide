import { useId } from 'react';
import { docsGetConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function DocsGetForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const documentId = asString(config.documentId);
  const mockOnDryRun = config.mockOnDryRun === true;

  const documentField = useId();
  const mockId = useId();

  const parsed = docsGetConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    documentId,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const documentIssue = issueFor('documentId');

  return (
    <div data-testid="docs-get-form" className="flex flex-col gap-4">
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
