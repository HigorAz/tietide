import { useId } from 'react';
import { slackCreateChannelConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SlackCreateChannelForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const name = asString(config.name);
  const isPrivate = config.isPrivate === true;

  const nameId = useId();
  const privateId = useId();

  const parsed = slackCreateChannelConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    name,
    isPrivate,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="slack-create-channel-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Slack connection</span>
        <ConnectionPicker
          provider="slack"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p role="alert" className="text-xs text-red-400">
            Select a Slack connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className={labelClass}>
          Channel name
        </label>
        <DataPillInput
          id={nameId}
          nodeId={nodeId}
          value={name}
          placeholder="project-x"
          aria-invalid={issueFor('name') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { name: next })}
        />
        {issueFor('name') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('name')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={privateId}
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => updateNodeConfig(nodeId, { isPrivate: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={privateId} className="text-xs text-text-secondary">
          Private channel
        </label>
      </div>
    </div>
  );
}
