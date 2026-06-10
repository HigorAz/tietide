import { useId } from 'react';
import { gmailLabelAddedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function GmailLabelAddedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const labelId = asString(config.labelId);
  const query = asString(config.query);

  const labelIdId = useId();
  const queryId = useId();

  const parsed = gmailLabelAddedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    labelId,
    query: query || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="gmail-label-added-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="gmail-label-added-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={labelIdId} className={labelClass}>
          Label ID
        </label>
        <DataPillInput
          id={labelIdId}
          nodeId={nodeId}
          value={labelId}
          placeholder="INBOX"
          onChange={(next) => updateNodeConfig(nodeId, { labelId: next })}
        />
        {issueFor('labelId') && (
          <p
            data-testid="gmail-label-added-label-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('labelId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={queryId} className={labelClass}>
          Gmail search query (optional)
        </label>
        <DataPillInput
          id={queryId}
          nodeId={nodeId}
          value={query}
          placeholder="from:boss@example.com"
          onChange={(next) => updateNodeConfig(nodeId, { query: next || undefined })}
        />
      </div>
    </div>
  );
}
