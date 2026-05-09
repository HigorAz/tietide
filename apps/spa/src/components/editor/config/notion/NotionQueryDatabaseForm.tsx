import { useId } from 'react';
import { notionQueryDatabaseConfigSchema } from '@tietide/shared';
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

const tryParseJson = (s: string): { ok: true; value: unknown } | { ok: false; error: string } => {
  if (!s.trim()) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
};

export function NotionQueryDatabaseForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const databaseId = asString(config.databaseId);
  const filterText = stringifyJson(config.filter);
  const sortsText = stringifyJson(config.sorts);
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : '';

  const dbId = useId();
  const filterId = useId();
  const sortsId = useId();
  const pageSizeId = useId();

  const filterParse = tryParseJson(filterText);
  const sortsParse = tryParseJson(sortsText);
  const parsed = notionQueryDatabaseConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    databaseId,
    filter: filterParse.ok ? filterParse.value : undefined,
    sorts: sortsParse.ok ? sortsParse.value : undefined,
    pageSize: typeof pageSize === 'number' ? pageSize : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const dbIssue = issueFor('databaseId');

  return (
    <div data-testid="notion-query-database-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Notion connection</span>
        <ConnectionPicker
          provider="notion"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="notion-query-database-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Notion connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={dbId} className={labelClass}>
          Database ID
        </label>
        <DataPillInput
          id={dbId}
          nodeId={nodeId}
          value={databaseId}
          placeholder="0123456789abcdef0123456789abcdef"
          aria-invalid={dbIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { databaseId: next })}
        />
        {dbIssue && (
          <p
            data-testid="notion-query-database-database-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {dbIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={filterId} className={labelClass}>
          Filter (optional JSON)
        </label>
        <textarea
          id={filterId}
          value={filterText}
          rows={4}
          placeholder='{"property":"Status","status":{"equals":"Done"}}'
          onChange={(e) => {
            const next = tryParseJson(e.target.value);
            updateNodeConfig(nodeId, { filter: next.ok ? next.value : e.target.value });
          }}
          className={cn(inputClass, 'font-mono text-xs')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={sortsId} className={labelClass}>
          Sorts (optional JSON array)
        </label>
        <textarea
          id={sortsId}
          value={sortsText}
          rows={3}
          placeholder='[{"property":"Created","direction":"ascending"}]'
          onChange={(e) => {
            const next = tryParseJson(e.target.value);
            updateNodeConfig(nodeId, { sorts: next.ok ? next.value : e.target.value });
          }}
          className={cn(inputClass, 'font-mono text-xs')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={pageSizeId} className={labelClass}>
          Page size (1–100)
        </label>
        <input
          id={pageSizeId}
          type="number"
          min={1}
          max={100}
          value={pageSize}
          onChange={(e) =>
            updateNodeConfig(nodeId, {
              pageSize: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className={inputClass}
        />
      </div>
    </div>
  );
}
