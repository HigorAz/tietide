import { useId } from 'react';
import { claudeMessagesConfigSchema } from '@tietide/shared';
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
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export function ClaudeMessagesForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const model = asString(config.model) || 'claude-sonnet-4-6';
  const system = asString(config.system);
  const prompt = asString(config.prompt);
  const maxTokens = asNumber(config.maxTokens) ?? 1024;
  const enablePromptCaching = config.enablePromptCaching === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const modelInputId = useId();
  const systemId = useId();
  const promptId = useId();
  const maxTokensId = useId();
  const cachingId = useId();
  const mockId = useId();

  const parsed = claudeMessagesConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    model,
    system: system || undefined,
    prompt,
    maxTokens,
    enablePromptCaching,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const promptIssue = issueFor('prompt');
  const maxTokensIssue = issueFor('maxTokens');

  return (
    <div data-testid="claude-messages-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Anthropic connection</span>
        <ConnectionPicker
          provider="anthropic"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="claude-messages-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select an Anthropic connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={modelInputId} className={labelClass}>
          Model
        </label>
        <input
          id={modelInputId}
          type="text"
          value={model}
          placeholder="claude-sonnet-4-6"
          onChange={(e) => updateNodeConfig(nodeId, { model: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={systemId} className={labelClass}>
          System prompt (optional)
        </label>
        <textarea
          id={systemId}
          value={system}
          rows={3}
          placeholder="You are a concise summarization assistant."
          onChange={(e) => updateNodeConfig(nodeId, { system: e.target.value || undefined })}
          className={cn(inputClass, 'font-mono text-xs')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={promptId} className={labelClass}>
          Prompt
        </label>
        <DataPillInput
          id={promptId}
          nodeId={nodeId}
          value={prompt}
          placeholder="Summarize: {{trigger.body.text}}"
          aria-invalid={promptIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { prompt: next })}
        />
        {promptIssue && (
          <p
            data-testid="claude-messages-prompt-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {promptIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={maxTokensId} className={labelClass}>
          Max tokens
        </label>
        <input
          id={maxTokensId}
          type="number"
          min={1}
          max={8192}
          value={maxTokens}
          onChange={(e) => {
            const n = Number(e.target.value);
            updateNodeConfig(nodeId, { maxTokens: Number.isFinite(n) ? n : undefined });
          }}
          className={inputClass}
        />
        {maxTokensIssue && (
          <p
            data-testid="claude-messages-max-tokens-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {maxTokensIssue}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={cachingId}
          type="checkbox"
          checked={enablePromptCaching}
          onChange={(e) => updateNodeConfig(nodeId, { enablePromptCaching: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={cachingId} className="text-xs text-text-secondary">
          Enable prompt caching (system prompt sent with cache_control: ephemeral)
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
          Skip Anthropic call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
