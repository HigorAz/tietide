import { useId } from 'react';
import { notionCreatePageConfigSchema } from '@tietide/shared';
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

export function NotionCreatePageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const parentDatabaseId = asString(config.parentDatabaseId);
  const propertiesText = stringifyJson(config.properties);
  const childrenText = stringifyJson(config.children);
  const mockOnDryRun = config.mockOnDryRun === true;

  const dbId = useId();
  const propsId = useId();
  const childrenId = useId();
  const mockId = useId();

  const propsParse = tryParseJson(propertiesText);
  const childrenParse = tryParseJson(childrenText);
  const parsed = notionCreatePageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    parentDatabaseId,
    properties: propsParse.ok ? (propsParse.value ?? {}) : {},
    children: childrenParse.ok ? childrenParse.value : undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const dbIssue = issueFor('parentDatabaseId');
  const propsIssue = !propsParse.ok ? propsParse.error : issueFor('properties');

  return (
    <div data-testid="notion-create-page-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Notion connection</span>
        <ConnectionPicker
          provider="notion"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="notion-create-page-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Notion connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={dbId} className={labelClass}>
          Parent database ID
        </label>
        <DataPillInput
          id={dbId}
          nodeId={nodeId}
          value={parentDatabaseId}
          placeholder="0123456789abcdef0123456789abcdef"
          aria-invalid={dbIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { parentDatabaseId: next })}
        />
        {dbIssue && (
          <p
            data-testid="notion-create-page-database-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {dbIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={propsId} className={labelClass}>
          Properties (JSON)
        </label>
        <DataPillInput
          id={propsId}
          nodeId={nodeId}
          value={propertiesText}
          placeholder='{"Name": {"title": [{"text": {"content": "Hello"}}]}}'
          aria-invalid={propsIssue !== null}
          onChange={(next) => {
            const parsedNext = tryParseJson(next);
            updateNodeConfig(nodeId, { properties: parsedNext.ok ? parsedNext.value : next });
          }}
        />
        {propsIssue && (
          <p
            data-testid="notion-create-page-properties-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {propsIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={childrenId} className={labelClass}>
          Block content (optional JSON array)
        </label>
        <DataPillInput
          id={childrenId}
          nodeId={nodeId}
          value={childrenText}
          placeholder='[{"object":"block","type":"paragraph","paragraph":{"rich_text":[]}}]'
          onChange={(next) => {
            const parsedNext = tryParseJson(next);
            updateNodeConfig(nodeId, { children: parsedNext.ok ? parsedNext.value : next });
          }}
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
          Skip Notion call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
