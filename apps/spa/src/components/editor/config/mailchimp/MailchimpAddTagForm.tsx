import { useId } from 'react';
import { mailchimpAddTagConfigSchema } from '@tietide/shared';
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

const tagsToText = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(', ') : '');
const textToTags = (s: string): string[] =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

export function MailchimpAddTagForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const listId = asString(config.listId);
  const email = asString(config.email);
  const tagsText = tagsToText(config.tags);
  const listFieldId = useId();
  const emailFieldId = useId();
  const tagsFieldId = useId();

  const parsed = mailchimpAddTagConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    listId,
    email,
    tags: textToTags(tagsText),
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const listIssue = issueFor('listId');
  const emailIssue = issueFor('email');
  const tagsIssue = issueFor('tags');

  return (
    <div data-testid="mailchimp-add-tag-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Mailchimp connection</span>
        <ConnectionPicker
          provider="mailchimp"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="mailchimp-add-tag-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Mailchimp connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={listFieldId} className={labelClass}>
          Audience (List) ID
        </label>
        <DataPillInput
          id={listFieldId}
          nodeId={nodeId}
          value={listId}
          onChange={(next) => updateNodeConfig(nodeId, { listId: next })}
        />
        {listIssue && (
          <p role="alert" className="text-xs text-red-400">
            {listIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailFieldId} className={labelClass}>
          Email
        </label>
        <DataPillInput
          id={emailFieldId}
          nodeId={nodeId}
          value={email}
          placeholder="jane@example.com"
          onChange={(next) => updateNodeConfig(nodeId, { email: next })}
        />
        {emailIssue && (
          <p role="alert" className="text-xs text-red-400">
            {emailIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={tagsFieldId} className={labelClass}>
          Tags (comma-separated)
        </label>
        <input
          id={tagsFieldId}
          type="text"
          value={tagsText}
          placeholder="vip, newsletter"
          onChange={(e) => updateNodeConfig(nodeId, { tags: textToTags(e.target.value) })}
          className={inputClass}
        />
        {tagsIssue && (
          <p role="alert" className="text-xs text-red-400">
            {tagsIssue}
          </p>
        )}
      </div>
    </div>
  );
}
