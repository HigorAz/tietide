import { useId } from 'react';
import { airtableListRecordsConfigSchema } from '@tietide/shared';
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

export function AirtableListRecordsForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const baseId = asString(config.baseId);
  const tableIdOrName = asString(config.tableIdOrName);
  const filterByFormula = asString(config.filterByFormula);
  const view = asString(config.view);
  const maxRecords = typeof config.maxRecords === 'number' ? config.maxRecords : '';
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : '';

  const baseFieldId = useId();
  const tableFieldId = useId();
  const filterFieldId = useId();
  const viewFieldId = useId();
  const maxFieldId = useId();
  const pageFieldId = useId();

  const parsed = airtableListRecordsConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    baseId,
    tableIdOrName,
    filterByFormula: filterByFormula || undefined,
    view: view || undefined,
    maxRecords: typeof maxRecords === 'number' ? maxRecords : undefined,
    pageSize: typeof pageSize === 'number' ? pageSize : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const baseIssue = issueFor('baseId');
  const tableIssue = issueFor('tableIdOrName');

  return (
    <div data-testid="airtable-list-records-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Airtable connection</span>
        <ConnectionPicker
          provider="airtable"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="airtable-list-records-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select an Airtable connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={baseFieldId} className={labelClass}>
          Base ID
        </label>
        <DataPillInput
          id={baseFieldId}
          nodeId={nodeId}
          value={baseId}
          placeholder="appAAAAAAAAAAAAAA"
          aria-invalid={baseIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { baseId: next })}
        />
        {baseIssue && (
          <p
            data-testid="airtable-list-records-base-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {baseIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={tableFieldId} className={labelClass}>
          Table name or ID
        </label>
        <DataPillInput
          id={tableFieldId}
          nodeId={nodeId}
          value={tableIdOrName}
          placeholder="Tasks"
          aria-invalid={tableIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { tableIdOrName: next })}
        />
        {tableIssue && (
          <p
            data-testid="airtable-list-records-table-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {tableIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={filterFieldId} className={labelClass}>
          filterByFormula (optional)
        </label>
        <DataPillInput
          id={filterFieldId}
          nodeId={nodeId}
          value={filterByFormula}
          placeholder='{Status}="Todo"'
          onChange={(next) => updateNodeConfig(nodeId, { filterByFormula: next || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={viewFieldId} className={labelClass}>
          View (optional)
        </label>
        <DataPillInput
          id={viewFieldId}
          nodeId={nodeId}
          value={view}
          placeholder="Grid view"
          onChange={(next) => updateNodeConfig(nodeId, { view: next || undefined })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={maxFieldId} className={labelClass}>
            Max records
          </label>
          <input
            id={maxFieldId}
            type="number"
            min={1}
            max={100}
            value={maxRecords}
            onChange={(e) =>
              updateNodeConfig(nodeId, {
                maxRecords: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={pageFieldId} className={labelClass}>
            Page size
          </label>
          <input
            id={pageFieldId}
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
    </div>
  );
}
