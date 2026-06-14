import { useId } from 'react';
import { aiGenerateImageConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { FieldLabel } from '../FieldLabel';
import { GenericFieldRow } from '../GenericFieldRow';
import type { FieldSpec } from '../GenericConnectorForm';
import { OptionsSection } from '../OptionsSection';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useStepLayout, useReportConfigValidity } from '../../steps/StepLayoutContext';

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

const PROMPT_FIELD: FieldSpec = {
  kind: 'pill',
  key: 'prompt',
  label: 'Prompt',
  required: true,
  help: 'What to draw. Supports data pills, e.g. {{ steps.caption.text }}.',
};

const POLLINATIONS_OPTIONS: ReadonlyArray<FieldSpec> = [
  { kind: 'number', key: 'width', label: 'Width (px)', placeholder: '1024' },
  { kind: 'number', key: 'height', label: 'Height (px)', placeholder: '1024' },
  { kind: 'text', key: 'model', label: 'Model', placeholder: 'flux' },
  { kind: 'number', key: 'seed', label: 'Seed', placeholder: 'random' },
];

const HF_MODEL_FIELD: FieldSpec = {
  kind: 'text',
  key: 'model',
  label: 'Model',
  placeholder: 'black-forest-labs/FLUX.1-schnell',
};

/**
 * AI: Generate Image config form. A `provider` selector switches between the
 * free, keyless Pollinations path (no connection; returns a public image URL)
 * and the token-based Hugging Face path (needs a `huggingface` connection;
 * returns image bytes — not a public URL, so it can't feed Instagram directly).
 */
export function AiGenerateImageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const layout = useStepLayout();
  const mockId = useId();

  const provider = asString(config.provider) || 'pollinations';
  const connectionId = asString(config.connectionId);
  const mockOnDryRun = config.mockOnDryRun === true;

  const candidate: Record<string, unknown> =
    provider === 'huggingface'
      ? {
          provider: 'huggingface',
          connectionId: connectionId || undefined,
          prompt: asString(config.prompt) || undefined,
          model: asString(config.model) || undefined,
          mockOnDryRun: mockOnDryRun || undefined,
        }
      : {
          provider: 'pollinations',
          prompt: asString(config.prompt) || undefined,
          width: asNumber(config.width),
          height: asNumber(config.height),
          model: asString(config.model) || undefined,
          seed: asNumber(config.seed),
          mockOnDryRun: mockOnDryRun || undefined,
        };

  const parsed = aiGenerateImageConfigSchema.safeParse(candidate);
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  // Configure validity ignores connectionId (it lives in the Connection step).
  const configureValid =
    parsed.success || parsed.error.issues.every((i) => i.path[0] === 'connectionId');
  useReportConfigValidity(configureValid);

  const connIssue = issueFor('connectionId');

  return (
    <div data-testid="ai-generate-image-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${nodeId}-provider`} label="Image provider" required />
        <select
          id={`${nodeId}-provider`}
          data-testid="ai-generate-image-provider"
          value={provider}
          onChange={(e) =>
            updateNodeConfig(nodeId, { provider: e.target.value, connectionId: undefined })
          }
          className="w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
        >
          <option value="pollinations">Pollinations — free, keyless (public image URL)</option>
          <option value="huggingface">Hugging Face — token (image bytes, not a public URL)</option>
        </select>
      </div>

      {provider === 'huggingface' &&
        (layout ? (
          <ConnectionPicker
            provider="huggingface"
            value={connectionId || null}
            onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
            errorMessage={connIssue ? 'Select a Hugging Face connection.' : null}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <FieldLabel label="Hugging Face connection" />
            <ConnectionPicker
              provider="huggingface"
              value={connectionId || null}
              onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
            />
            {connIssue && (
              <p role="alert" className="text-xs text-red-400">
                Select a Hugging Face connection.
              </p>
            )}
          </div>
        ))}

      <GenericFieldRow
        field={PROMPT_FIELD}
        fieldId="ai-generate-image-prompt"
        testId="ai-generate-image"
        config={config}
        nodeId={nodeId}
        issue={issueFor('prompt')}
      />

      <OptionsSection meta="options · defaults" data-testid="ai-generate-image-options">
        {(provider === 'huggingface' ? [HF_MODEL_FIELD] : POLLINATIONS_OPTIONS).map((f) => (
          <GenericFieldRow
            key={f.key}
            field={f}
            fieldId={`ai-generate-image-${f.key}`}
            testId="ai-generate-image"
            config={config}
            nodeId={nodeId}
            issue={issueFor(f.key)}
          />
        ))}
        <ToggleSwitch
          id={mockId}
          checked={mockOnDryRun}
          onChange={(next) => updateNodeConfig(nodeId, { mockOnDryRun: next })}
          label="Skip image generation on test runs (return mocked output)"
        />
      </OptionsSection>
    </div>
  );
}
