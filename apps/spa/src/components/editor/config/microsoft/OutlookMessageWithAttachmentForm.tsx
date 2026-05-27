import { useId } from 'react';
import { outlookMessageWithAttachmentConfigSchema } from '@tietide/shared';
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

export function OutlookMessageWithAttachmentForm({
  nodeId,
  config,
}: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const filter = asString(config.filter);

  const filterId = useId();

  const parsed = outlookMessageWithAttachmentConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    filter: filter || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="outlook-message-with-attachment-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p role="alert" className="text-xs text-red-400">
            Select a Microsoft connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={filterId} className={labelClass}>
          Extra OData $filter (optional)
        </label>
        <input
          id={filterId}
          type="text"
          value={filter}
          onChange={(e) => updateNodeConfig(nodeId, { filter: e.target.value || undefined })}
          placeholder="from/emailAddress/address eq 'boss@example.com'"
          className={inputClass}
        />
        {issueFor('filter') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('filter')}
          </p>
        )}
        <p className="text-xs text-text-muted">
          Already filtered to inbox messages where{' '}
          <code className="font-mono text-[11px]">hasAttachments eq true</code>. Any extra filter is
          AND-merged with it.
        </p>
      </div>
    </div>
  );
}
