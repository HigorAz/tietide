import { useId } from 'react';
import { calendarListEventsConfigSchema } from '@tietide/shared';
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

export function CalendarListEventsForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const calendarId = asString(config.calendarId);
  const timeMin = asString(config.timeMin);
  const timeMax = asString(config.timeMax);
  const query = asString(config.query);
  const maxResults = typeof config.maxResults === 'number' ? config.maxResults : undefined;
  const mockOnDryRun = config.mockOnDryRun === true;

  const calendarField = useId();
  const timeMinField = useId();
  const timeMaxField = useId();
  const queryField = useId();
  const maxField = useId();
  const mockId = useId();

  const parsed = calendarListEventsConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    calendarId: calendarId || undefined,
    timeMin: timeMin || undefined,
    timeMax: timeMax || undefined,
    query: query || undefined,
    maxResults,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const timeMinIssue = issueFor('timeMin');
  const timeMaxIssue = issueFor('timeMax');

  return (
    <div data-testid="calendar-list-events-form" className="flex flex-col gap-4">
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
        <label htmlFor={timeMinField} className={labelClass}>
          Time min (ISO 8601, optional)
        </label>
        <DataPillInput
          id={timeMinField}
          nodeId={nodeId}
          value={timeMin}
          placeholder="2026-05-01T00:00:00Z"
          aria-invalid={timeMinIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { timeMin: next || undefined })}
        />
        {timeMinIssue && (
          <p role="alert" className="text-xs text-red-400">
            {timeMinIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={timeMaxField} className={labelClass}>
          Time max (ISO 8601, optional)
        </label>
        <DataPillInput
          id={timeMaxField}
          nodeId={nodeId}
          value={timeMax}
          placeholder="2026-05-31T23:59:59Z"
          aria-invalid={timeMaxIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { timeMax: next || undefined })}
        />
        {timeMaxIssue && (
          <p role="alert" className="text-xs text-red-400">
            {timeMaxIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={queryField} className={labelClass}>
          Text search (optional)
        </label>
        <input
          id={queryField}
          type="text"
          value={query}
          placeholder="standup"
          onChange={(e) => updateNodeConfig(nodeId, { query: e.target.value || undefined })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={maxField} className={labelClass}>
          Max results (optional, ≤ 2500)
        </label>
        <input
          id={maxField}
          type="number"
          min={1}
          max={2500}
          value={maxResults ?? ''}
          placeholder="250"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { maxResults: undefined });
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) updateNodeConfig(nodeId, { maxResults: n });
          }}
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
