import { useId } from 'react';
import { gmailLabelAddedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
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
        <input
          id={labelIdId}
          type="text"
          value={labelId}
          onChange={(e) => updateNodeConfig(nodeId, { labelId: e.target.value })}
          placeholder="INBOX"
          className={inputClass}
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
        <input
          id={queryId}
          type="text"
          value={query}
          onChange={(e) => updateNodeConfig(nodeId, { query: e.target.value || undefined })}
          placeholder="from:boss@example.com"
          className={inputClass}
        />
      </div>
    </div>
  );
}
