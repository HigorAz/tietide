import { useId } from 'react';
import { ollamaGenerateConfigSchema, OLLAMA_TEXT_MODELS } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';
import { OllamaModelSelect } from './OllamaModelSelect';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function OllamaGenerateForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const model = asString(config.model);
  const prompt = asString(config.prompt);
  const mockOnDryRun = config.mockOnDryRun === true;

  const modelInputId = useId();
  const promptId = useId();
  const mockId = useId();

  const parsed = ollamaGenerateConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    model: model || undefined,
    prompt,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const promptIssue = issueFor('prompt');

  return (
    <div data-testid="ollama-generate-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Ollama connection</span>
        <ConnectionPicker
          provider="ollama"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="ollama-generate-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select an Ollama connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={modelInputId} className={labelClass}>
          Model override (optional)
        </label>
        <OllamaModelSelect
          id={modelInputId}
          connectionId={connectionId || undefined}
          value={model}
          onChange={(next) => updateNodeConfig(nodeId, { model: next || undefined })}
          curated={OLLAMA_TEXT_MODELS}
          allowBlank
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
          placeholder="Translate to French: {{trigger.body.text}}"
          aria-invalid={promptIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { prompt: next })}
        />
        {promptIssue && (
          <p
            data-testid="ollama-generate-prompt-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {promptIssue}
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
          Skip Ollama call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
