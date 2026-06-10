import { useId } from 'react';
import { airtableUpdateRecordConfigSchema } from '@tietide/shared';
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

export function AirtableUpdateRecordForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const baseId = asString(config.baseId);
  const tableIdOrName = asString(config.tableIdOrName);
  const recordId = asString(config.recordId);
  const fieldsText = stringifyJson(config.fields);

  const baseFieldId = useId();
  const tableFieldId = useId();
  const recordFieldId = useId();
  const fieldsFieldId = useId();

  const fieldsParse = tryParseJson(fieldsText);
  const parsed = airtableUpdateRecordConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    baseId,
    tableIdOrName,
    recordId,
    fields: fieldsParse.ok ? (fieldsParse.value ?? {}) : {},
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const baseIssue = issueFor('baseId');
  const tableIssue = issueFor('tableIdOrName');
  const recordIssue = issueFor('recordId');

  return (
    <div data-testid="airtable-update-record-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Airtable connection</span>
        <ConnectionPicker
          provider="airtable"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="airtable-update-record-connection-error"
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
            data-testid="airtable-update-record-base-error"
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
            data-testid="airtable-update-record-table-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {tableIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={recordFieldId} className={labelClass}>
          Record ID
        </label>
        <DataPillInput
          id={recordFieldId}
          nodeId={nodeId}
          value={recordId}
          placeholder="recXXXXXXXXXXXX"
          aria-invalid={recordIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { recordId: next })}
        />
        {recordIssue && (
          <p
            data-testid="airtable-update-record-record-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {recordIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldsFieldId} className={labelClass}>
          Fields (JSON)
        </label>
        <DataPillInput
          id={fieldsFieldId}
          nodeId={nodeId}
          value={fieldsText}
          placeholder='{"Status": "Done"}'
          onChange={(next) => {
            const parsedNext = tryParseJson(next);
            updateNodeConfig(nodeId, { fields: parsedNext.ok ? parsedNext.value : next });
          }}
        />
      </div>
    </div>
  );
}
