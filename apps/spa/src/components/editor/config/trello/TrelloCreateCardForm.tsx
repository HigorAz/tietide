import { useId } from 'react';
import { trelloCreateCardConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function TrelloCreateCardForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const listId = asString(config.listId);
  const name = asString(config.name);
  const desc = asString(config.desc);
  const mockOnDryRun = config.mockOnDryRun === true;

  const listFieldId = useId();
  const nameFieldId = useId();
  const descFieldId = useId();
  const mockId = useId();

  const parsed = trelloCreateCardConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    listId,
    name,
    desc: desc || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const listIssue = issueFor('listId');
  const nameIssue = issueFor('name');

  return (
    <div data-testid="trello-create-card-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Trello connection</span>
        <ConnectionPicker
          provider="trello"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="trello-create-card-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Trello connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={listFieldId} className={labelClass}>
          List ID
        </label>
        <DataPillInput
          id={listFieldId}
          nodeId={nodeId}
          value={listId}
          placeholder="60a1b2c3d4e5f6a7b8c9d0e1"
          aria-invalid={listIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { listId: next })}
        />
        {listIssue && (
          <p
            data-testid="trello-create-card-list-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {listIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameFieldId} className={labelClass}>
          Card name
        </label>
        <DataPillInput
          id={nameFieldId}
          nodeId={nodeId}
          value={name}
          placeholder="New idea from {{trigger.title}}"
          aria-invalid={nameIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { name: next })}
        />
        {nameIssue && (
          <p
            data-testid="trello-create-card-name-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {nameIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={descFieldId} className={labelClass}>
          Description (optional)
        </label>
        <DataPillInput
          id={descFieldId}
          nodeId={nodeId}
          value={desc}
          onChange={(next) => updateNodeConfig(nodeId, { desc: next || undefined })}
        />
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
          Skip Trello call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
