import { useId } from 'react';
import { calendarGetEventConfigSchema } from '@tietide/shared';
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

export function CalendarGetEventForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const calendarId = asString(config.calendarId);
  const eventId = asString(config.eventId);
  const mockOnDryRun = config.mockOnDryRun === true;

  const calendarField = useId();
  const eventField = useId();
  const mockId = useId();

  const parsed = calendarGetEventConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    calendarId: calendarId || undefined,
    eventId,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const eventIssue = issueFor('eventId');

  return (
    <div data-testid="calendar-get-event-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connectionIssue && (
          <p role="alert" className="text-xs text-red-400">
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={calendarField} className={labelClass}>
          Calendar ID (default: primary)
        </label>
        <input
          id={calendarField}
          type="text"
          value={calendarId}
          placeholder="primary"
          onChange={(e) => updateNodeConfig(nodeId, { calendarId: e.target.value || undefined })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={eventField} className={labelClass}>
          Event ID
        </label>
        <DataPillInput
          id={eventField}
          nodeId={nodeId}
          value={eventId}
          placeholder="{{trigger.event.id}}"
          aria-invalid={eventIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { eventId: next })}
        />
        {eventIssue && (
          <p role="alert" className="text-xs text-red-400">
            {eventIssue}
          </p>
        )}
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
          Skip Calendar call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
