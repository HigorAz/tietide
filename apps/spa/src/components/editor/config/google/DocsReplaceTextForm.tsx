import { useId } from 'react';
import { docsReplaceTextConfigSchema } from '@tietide/shared';
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

const asReplacements = (v: unknown): Record<string, string> => {
  if (typeof v !== 'object' || v === null) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
};

// One "token=value" pair per line. Splits on the first '=' so values may
// contain '='.
const parsePairs = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key) out[key] = line.slice(eq + 1);
  }
  return out;
};

const stringifyPairs = (r: Record<string, string>): string =>
  Object.entries(r)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

export function DocsReplaceTextForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const documentId = asString(config.documentId);
  const replacements = asReplacements(config.replacements);
  const matchCase = config.matchCase === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const documentField = useId();
  const pairsField = useId();
  const matchId = useId();
  const mockId = useId();

  const parsed = docsReplaceTextConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    documentId,
    replacements: Object.keys(replacements).length ? replacements : undefined,
    matchCase: matchCase || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const documentIssue = issueFor('documentId');
  const replacementsIssue = issueFor('replacements');

  return (
    <div data-testid="docs-replace-text-form" className="flex flex-col gap-4">
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
        <label htmlFor={documentField} className={labelClass}>
          Document ID
        </label>
        <DataPillInput
          id={documentField}
          nodeId={nodeId}
          value={documentId}
          placeholder="1AbC..."
          aria-invalid={documentIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { documentId: next })}
        />
        {documentIssue && (
          <p role="alert" className="text-xs text-red-400">
            {documentIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={pairsField} className={labelClass}>
          Replacements (one token=value per line)
        </label>
        <textarea
          id={pairsField}
          value={stringifyPairs(replacements)}
          rows={5}
          placeholder={'{{name}}=Alice\n{{date}}=2026-05-26'}
          aria-invalid={replacementsIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { replacements: parsePairs(e.target.value) })}
          className={inputClass}
        />
        {replacementsIssue && (
          <p role="alert" className="text-xs text-red-400">
            {replacementsIssue}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={matchId}
          type="checkbox"
          checked={matchCase}
          onChange={(e) => updateNodeConfig(nodeId, { matchCase: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={matchId} className="text-xs text-text-secondary">
          Match case
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
          Skip Docs call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
