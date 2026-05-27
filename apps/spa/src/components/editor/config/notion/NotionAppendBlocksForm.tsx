import { useId } from 'react';
import { notionAppendBlocksConfigSchema } from '@tietide/shared';
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

export function NotionAppendBlocksForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const blockId = asString(config.blockId);
  const childrenText = stringifyJson(config.children);
  const mockOnDryRun = config.mockOnDryRun === true;

  const blockInputId = useId();
  const childrenId = useId();
  const mockId = useId();

  const childrenParse = tryParseJson(childrenText);
  const parsed = notionAppendBlocksConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    blockId,
    children: childrenParse.ok ? childrenParse.value : undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const blockIssue = issueFor('blockId');
  const childrenIssue = !childrenParse.ok ? childrenParse.error : issueFor('children');

  return (
    <div data-testid="notion-append-blocks-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Notion connection</span>
        <ConnectionPicker
          provider="notion"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="notion-append-blocks-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Notion connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={blockInputId} className={labelClass}>
          Page / block ID
        </label>
        <DataPillInput
          id={blockInputId}
          nodeId={nodeId}
          value={blockId}
          placeholder="0123456789abcdef0123456789abcdef"
          onChange={(next) => updateNodeConfig(nodeId, { blockId: next })}
        />
        {blockIssue && (
          <p
            data-testid="notion-append-blocks-block-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {blockIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={childrenId} className={labelClass}>
          Block content (JSON array)
        </label>
        <textarea
          id={childrenId}
          value={childrenText}
          rows={6}
          placeholder='[{"object":"block","type":"paragraph","paragraph":{"rich_text":[]}}]'
          onChange={(e) => {
            const next = tryParseJson(e.target.value);
            updateNodeConfig(nodeId, { children: next.ok ? next.value : e.target.value });
          }}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {childrenIssue && (
          <p
            data-testid="notion-append-blocks-children-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {childrenIssue}
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
          Skip Notion call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
