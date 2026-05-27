import { useId } from 'react';
import { notionUpdatePageConfigSchema } from '@tietide/shared';
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

export function NotionUpdatePageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const pageId = asString(config.pageId);
  const propertiesText = stringifyJson(config.properties);
  const archived = config.archived === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const pageInputId = useId();
  const propsId = useId();
  const archivedId = useId();
  const mockId = useId();

  const propsParse = tryParseJson(propertiesText);
  const parsed = notionUpdatePageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    pageId,
    properties: propsParse.ok ? propsParse.value : {},
    archived: archived || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const pageIssue = issueFor('pageId');
  const propsIssue = !propsParse.ok ? propsParse.error : null;

  return (
    <div data-testid="notion-update-page-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Notion connection</span>
        <ConnectionPicker
          provider="notion"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="notion-update-page-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Notion connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={pageInputId} className={labelClass}>
          Page ID
        </label>
        <DataPillInput
          id={pageInputId}
          nodeId={nodeId}
          value={pageId}
          placeholder="0123456789abcdef0123456789abcdef"
          onChange={(next) => updateNodeConfig(nodeId, { pageId: next })}
        />
        {pageIssue && (
          <p
            data-testid="notion-update-page-page-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {pageIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={propsId} className={labelClass}>
          Properties patch (optional JSON)
        </label>
        <textarea
          id={propsId}
          value={propertiesText}
          rows={6}
          placeholder='{"Status": {"select": {"name": "Done"}}}'
          onChange={(e) => {
            const next = tryParseJson(e.target.value);
            updateNodeConfig(nodeId, { properties: next.ok ? next.value : e.target.value });
          }}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {propsIssue && (
          <p
            data-testid="notion-update-page-properties-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {propsIssue}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={archivedId}
          type="checkbox"
          checked={archived}
          onChange={(e) => updateNodeConfig(nodeId, { archived: e.target.checked || undefined })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={archivedId} className="text-xs text-text-secondary">
          Archive this page
        </label>
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
          Skip Notion call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
