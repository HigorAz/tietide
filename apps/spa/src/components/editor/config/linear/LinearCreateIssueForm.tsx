import { useId } from 'react';
import { linearCreateIssueConfigSchema } from '@tietide/shared';
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

export function LinearCreateIssueForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const teamId = asString(config.teamId);
  const title = asString(config.title);
  const description = asString(config.description);
  const assigneeId = asString(config.assigneeId);
  const priority = typeof config.priority === 'number' ? config.priority : '';

  const teamFieldId = useId();
  const titleFieldId = useId();
  const descFieldId = useId();
  const assigneeFieldId = useId();
  const priorityFieldId = useId();

  const parsed = linearCreateIssueConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    teamId,
    title,
    description: description || undefined,
    assigneeId: assigneeId || undefined,
    priority: typeof priority === 'number' ? priority : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const teamIssue = issueFor('teamId');
  const titleIssue = issueFor('title');

  return (
    <div data-testid="linear-create-issue-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Linear connection</span>
        <ConnectionPicker
          provider="linear"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="linear-create-issue-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Linear connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={teamFieldId} className={labelClass}>
          Team ID (UUID)
        </label>
        <DataPillInput
          id={teamFieldId}
          nodeId={nodeId}
          value={teamId}
          placeholder="11111111-1111-4111-8111-111111111111"
          aria-invalid={teamIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { teamId: next })}
        />
        {teamIssue && (
          <p
            data-testid="linear-create-issue-team-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {teamIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleFieldId} className={labelClass}>
          Title
        </label>
        <DataPillInput
          id={titleFieldId}
          nodeId={nodeId}
          value={title}
          placeholder="Bug: ..."
          aria-invalid={titleIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { title: next })}
        />
        {titleIssue && (
          <p
            data-testid="linear-create-issue-title-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {titleIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={descFieldId} className={labelClass}>
          Description (optional)
        </label>
        <textarea
          id={descFieldId}
          value={description}
          rows={4}
          onChange={(e) => updateNodeConfig(nodeId, { description: e.target.value || undefined })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={assigneeFieldId} className={labelClass}>
          Assignee ID (optional)
        </label>
        <DataPillInput
          id={assigneeFieldId}
          nodeId={nodeId}
          value={assigneeId}
          placeholder="UUID"
          onChange={(next) => updateNodeConfig(nodeId, { assigneeId: next || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={priorityFieldId} className={labelClass}>
          Priority (0–4, optional)
        </label>
        <input
          id={priorityFieldId}
          type="number"
          min={0}
          max={4}
          value={priority}
          onChange={(e) =>
            updateNodeConfig(nodeId, {
              priority: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
          className={inputClass}
        />
      </div>
    </div>
  );
}
