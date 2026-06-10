import { useId } from 'react';
import { calendarEventCreatedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function CalendarEventCreatedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const calendarId = asString(config.calendarId);

  const calendarIdId = useId();

  const parsed = calendarEventCreatedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    calendarId: calendarId || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="calendar-event-created-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="calendar-event-created-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={calendarIdId} className={labelClass}>
          Calendar ID
        </label>
        <DataPillInput
          id={calendarIdId}
          nodeId={nodeId}
          value={calendarId}
          placeholder="primary"
          onChange={(next) => updateNodeConfig(nodeId, { calendarId: next })}
        />
      </div>
    </div>
  );
}
