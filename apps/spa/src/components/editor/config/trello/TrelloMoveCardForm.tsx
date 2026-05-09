import { useId } from 'react';
import { trelloMoveCardConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function TrelloMoveCardForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const cardId = asString(config.cardId);
  const targetListId = asString(config.targetListId);

  const cardFieldId = useId();
  const listFieldId = useId();

  const parsed = trelloMoveCardConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    cardId,
    targetListId,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const cardIssue = issueFor('cardId');
  const listIssue = issueFor('targetListId');

  return (
    <div data-testid="trello-move-card-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Trello connection</span>
        <ConnectionPicker
          provider="trello"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="trello-move-card-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Trello connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={cardFieldId} className={cn(labelClass)}>
          Card ID
        </label>
        <DataPillInput
          id={cardFieldId}
          nodeId={nodeId}
          value={cardId}
          placeholder="60a1b2c3d4e5f6a7b8c9d0e1"
          aria-invalid={cardIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { cardId: next })}
        />
        {cardIssue && (
          <p
            data-testid="trello-move-card-card-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {cardIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={listFieldId} className={labelClass}>
          Target list ID
        </label>
        <DataPillInput
          id={listFieldId}
          nodeId={nodeId}
          value={targetListId}
          placeholder="60aaaaaaaaaaaaaaaaaaaaaa"
          aria-invalid={listIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { targetListId: next })}
        />
        {listIssue && (
          <p
            data-testid="trello-move-card-list-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {listIssue}
          </p>
        )}
      </div>
    </div>
  );
}
