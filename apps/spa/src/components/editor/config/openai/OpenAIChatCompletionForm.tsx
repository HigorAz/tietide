import { useId } from 'react';
import { openaiChatCompletionConfigSchema } from '@tietide/shared';
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

export function OpenAIChatCompletionForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const model = asString(config.model) || 'gpt-4o';
  const system = asString(config.system);
  const prompt = asString(config.prompt);
  const maxTokens = asNumber(config.maxTokens);
  const mockOnDryRun = config.mockOnDryRun === true;

  const modelInputId = useId();
  const systemId = useId();
  const promptId = useId();
  const maxTokensId = useId();
  const mockId = useId();

  const parsed = openaiChatCompletionConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    model,
    system: system || undefined,
    prompt,
    maxTokens,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const promptIssue = issueFor('prompt');
  const maxTokensIssue = issueFor('maxTokens');

  return (
    <div data-testid="openai-chat-completion-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>OpenAI connection</span>
        <ConnectionPicker
          provider="openai"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="openai-chat-completion-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select an OpenAI connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={modelInputId} className={labelClass}>
          Model
        </label>
        <DataPillInput
          id={modelInputId}
          nodeId={nodeId}
          value={model}
          placeholder="gpt-4o"
          onChange={(next) => updateNodeConfig(nodeId, { model: next })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={systemId} className={labelClass}>
          System prompt (optional)
        </label>
        <DataPillInput
          id={systemId}
          nodeId={nodeId}
          value={system}
          placeholder="You are a concise assistant."
          onChange={(next) => updateNodeConfig(nodeId, { system: next || undefined })}
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
          placeholder="Answer: {{trigger.body.question}}"
          aria-invalid={promptIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { prompt: next })}
        />
        {promptIssue && (
          <p
            data-testid="openai-chat-completion-prompt-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {promptIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={maxTokensId} className={labelClass}>
          Max tokens (optional)
        </label>
        <input
          id={maxTokensId}
          type="number"
          min={1}
          max={8192}
          value={maxTokens ?? ''}
          placeholder="leave blank for provider default"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { maxTokens: undefined });
              return;
            }
            const n = Number(raw);
            updateNodeConfig(nodeId, { maxTokens: Number.isFinite(n) ? n : undefined });
          }}
          className={inputClass}
        />
        {maxTokensIssue && (
          <p
            data-testid="openai-chat-completion-max-tokens-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {maxTokensIssue}
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
          Skip OpenAI call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
