import { openaiGenerateImageConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'prompt', label: 'Prompt', multiline: true, required: true },
  { kind: 'pill', key: 'model', label: 'Model', placeholder: 'dall-e-3' },
  {
    kind: 'select',
    key: 'size',
    label: 'Size',
    options: [
      { value: '256x256', label: '256×256' },
      { value: '512x512', label: '512×512' },
      { value: '1024x1024', label: '1024×1024' },
      { value: '1792x1024', label: '1792×1024' },
      { value: '1024x1792', label: '1024×1792' },
    ],
  },
  { kind: 'number', key: 'count', label: 'Count (1–4)', placeholder: '1' },
];

export function OpenAIGenerateImageForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="openai-generate-image-form"
      provider="openai"
      providerLabel="OpenAI"
      schema={openaiGenerateImageConfigSchema}
      fields={FIELDS}
    />
  );
}
