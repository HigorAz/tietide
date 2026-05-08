import { useId, useState } from 'react';
import { calendarCreateConfigSchema } from '@tietide/shared';
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

export function CalendarCreateForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const calendarId = asString(config.calendarId) || 'primary';
  const summary = asString(config.summary);
  const description = asString(config.description);
  const start = asString(config.start);
  const end = asString(config.end);
  const attendeesRaw = Array.isArray(config.attendees)
    ? (config.attendees as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const mockOnDryRun = config.mockOnDryRun === true;

  const calId = useId();
  const summaryId = useId();
  const descId = useId();
  const startId = useId();
  const endId = useId();
  const attId = useId();
  const mockId = useId();

  const initialAttText = attendeesRaw.join(', ');
  const [attText, setAttText] = useState(initialAttText);

  const parsed = calendarCreateConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    calendarId,
    summary,
    description: description || undefined,
    start,
    end,
    attendees: attendeesRaw.length > 0 ? attendeesRaw : undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  const handleAttBlur = () => {
    const list = attText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    updateNodeConfig(nodeId, { attendees: list.length > 0 ? list : undefined });
  };

  return (
    <div data-testid="calendar-create-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="calendar-create-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={calId} className={labelClass}>
          Calendar ID
        </label>
        <input
          id={calId}
          type="text"
          value={calendarId}
          onChange={(e) => updateNodeConfig(nodeId, { calendarId: e.target.value })}
          placeholder="primary"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={summaryId} className={labelClass}>
          Summary
        </label>
        <DataPillInput
          id={summaryId}
          nodeId={nodeId}
          value={summary}
          placeholder="Standup with {{trigger.name}}"
          onChange={(next) => updateNodeConfig(nodeId, { summary: next })}
        />
        {issueFor('summary') && (
          <p
            data-testid="calendar-create-summary-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('summary')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={descId} className={labelClass}>
          Description (optional)
        </label>
        <textarea
          id={descId}
          value={description}
          onChange={(e) => updateNodeConfig(nodeId, { description: e.target.value || undefined })}
          rows={3}
          className={cn(inputClass, 'font-mono text-xs')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={startId} className={labelClass}>
          Start (ISO 8601)
        </label>
        <input
          id={startId}
          type="text"
          value={start}
          onChange={(e) => updateNodeConfig(nodeId, { start: e.target.value })}
          placeholder="2026-06-01T09:00:00Z"
          className={inputClass}
        />
        {issueFor('start') && (
          <p
            data-testid="calendar-create-start-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('start')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={endId} className={labelClass}>
          End (ISO 8601)
        </label>
        <input
          id={endId}
          type="text"
          value={end}
          onChange={(e) => updateNodeConfig(nodeId, { end: e.target.value })}
          placeholder="2026-06-01T09:30:00Z"
          className={inputClass}
        />
        {issueFor('end') && (
          <p data-testid="calendar-create-end-error" role="alert" className="text-xs text-red-400">
            {issueFor('end')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={attId} className={labelClass}>
          Attendees (comma-separated emails, optional)
        </label>
        <input
          id={attId}
          type="text"
          value={attText}
          onChange={(e) => setAttText(e.target.value)}
          onBlur={handleAttBlur}
          placeholder="alice@example.com, bob@example.com"
          className={inputClass}
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
          Skip Calendar call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
