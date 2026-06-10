import { useId } from 'react';
import {
  mailchimpUpdateSubscriberConfigSchema,
  MAILCHIMP_SUBSCRIBER_STATUSES,
} from '@tietide/shared';
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

const stringifyJson = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return '';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return '';
  }
};

const tryParseJson = (s: string): { ok: true; value: unknown } | { ok: false } => {
  if (!s.trim()) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
};

export function MailchimpUpdateSubscriberForm({
  nodeId,
  config,
}: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const listId = asString(config.listId);
  const email = asString(config.email);
  const status = asString(config.status);
  const mergeText = stringifyJson(config.mergeFields);
  const listFieldId = useId();
  const emailFieldId = useId();
  const statusFieldId = useId();
  const mergeFieldId = useId();

  const mergeParse = tryParseJson(mergeText);
  const parsed = mailchimpUpdateSubscriberConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    listId,
    email,
    status: status || undefined,
    mergeFields: mergeParse.ok ? mergeParse.value : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const listIssue = issueFor('listId');
  const emailIssue = issueFor('email');
  const statusIssue = issueFor('status');

  return (
    <div data-testid="mailchimp-update-subscriber-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Mailchimp connection</span>
        <ConnectionPicker
          provider="mailchimp"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="mailchimp-update-subscriber-connection-error"
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
        <label htmlFor={statusFieldId} className={labelClass}>
          Status (optional)
        </label>
        <select
          id={statusFieldId}
          value={status}
          onChange={(e) => updateNodeConfig(nodeId, { status: e.target.value || undefined })}
          className={inputClass}
        >
          <option value="">— Leave unchanged —</option>
          {MAILCHIMP_SUBSCRIBER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {statusIssue && (
          <p role="alert" className="text-xs text-red-400">
            {statusIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mergeFieldId} className={labelClass}>
          Merge fields (JSON, optional)
        </label>
        <DataPillInput
          id={mergeFieldId}
          nodeId={nodeId}
          value={mergeText}
          placeholder='{"FNAME": "Jane"}'
          onChange={(next) => {
            const parsedNext = tryParseJson(next);
            updateNodeConfig(nodeId, { mergeFields: parsedNext.ok ? parsedNext.value : next });
          }}
        />
      </div>
    </div>
  );
}
