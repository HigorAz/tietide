import { useId } from 'react';
import { notionFindDatabaseItemConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

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

export function NotionFindDatabaseItemForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const databaseId = asString(config.databaseId);
  const filterText = stringifyJson(config.filter);
  const sortsText = stringifyJson(config.sorts);

  const dbId = useId();
  const filterId = useId();
  const sortsId = useId();

  const filterParse = tryParseJson(filterText);
  const sortsParse = tryParseJson(sortsText);
  const parsed = notionFindDatabaseItemConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    databaseId,
    filter: filterParse.ok ? filterParse.value : undefined,
    sorts: sortsParse.ok ? sortsParse.value : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const dbIssue = issueFor('databaseId');
  const filterIssue = !filterParse.ok ? filterParse.error : null;

  return (
    <div data-testid="notion-find-database-item-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Notion connection</span>
        <ConnectionPicker
          provider="notion"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="notion-find-database-item-connection-error"
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
          onChange={(next) => updateNodeConfig(nodeId, { databaseId: next })}
        />
        {dbIssue && (
          <p
            data-testid="notion-find-database-item-database-error"
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
        <DataPillInput
          id={filterId}
          nodeId={nodeId}
          value={filterText}
          placeholder='{"property": "Email", "email": {"equals": "a@b.com"}}'
          onChange={(next) => {
            const parsedNext = tryParseJson(next);
            updateNodeConfig(nodeId, { filter: parsedNext.ok ? parsedNext.value : next });
          }}
        />
        {filterIssue && (
          <p
            data-testid="notion-find-database-item-filter-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {filterIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={sortsId} className={labelClass}>
          Sorts (optional JSON array)
        </label>
        <DataPillInput
          id={sortsId}
          nodeId={nodeId}
          value={sortsText}
          placeholder='[{"timestamp": "created_time", "direction": "descending"}]'
          onChange={(next) => {
            const parsedNext = tryParseJson(next);
            updateNodeConfig(nodeId, { sorts: parsedNext.ok ? parsedNext.value : next });
          }}
        />
      </div>
    </div>
  );
}
