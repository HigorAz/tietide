import { useId } from 'react';
import { linearUpdateIssueStatusConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function LinearUpdateIssueStatusForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const issueId = asString(config.issueId);
  const stateId = asString(config.stateId);

  const issueFieldId = useId();
  const stateFieldId = useId();

  const parsed = linearUpdateIssueStatusConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    issueId,
    stateId,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const idIssue = issueFor('issueId');
  const stateIssue = issueFor('stateId');

  return (
    <div data-testid="linear-update-issue-status-form" className={cn('flex flex-col gap-4')}>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Linear connection</span>
        <ConnectionPicker
          provider="linear"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="linear-update-issue-status-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Linear connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={issueFieldId} className={labelClass}>
          Issue ID (UUID)
        </label>
        <DataPillInput
          id={issueFieldId}
          nodeId={nodeId}
          value={issueId}
          placeholder="11111111-1111-4111-8111-111111111111"
          aria-invalid={idIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { issueId: next })}
        />
        {idIssue && (
          <p
            data-testid="linear-update-issue-status-issue-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {idIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={stateFieldId} className={labelClass}>
          Workflow state ID (UUID)
        </label>
        <DataPillInput
          id={stateFieldId}
          nodeId={nodeId}
          value={stateId}
          placeholder="22222222-2222-4222-8222-222222222222"
          aria-invalid={stateIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { stateId: next })}
        />
        {stateIssue && (
          <p
            data-testid="linear-update-issue-status-state-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {stateIssue}
          </p>
        )}
      </div>
    </div>
  );
}
