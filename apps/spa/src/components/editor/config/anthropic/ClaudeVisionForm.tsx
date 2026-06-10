import { anthropicVisionConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'prompt', label: 'Prompt', required: true },
  { kind: 'pill', key: 'imageUrl', label: 'Image URL', placeholder: 'https://…/image.png' },
  { kind: 'pill', key: 'imageBase64', label: 'Image base64 (alternative to URL)' },
  {
    kind: 'select',
    key: 'mediaType',
    label: 'Media type (for base64)',
    options: [
      { value: 'image/jpeg', label: 'image/jpeg' },
      { value: 'image/png', label: 'image/png' },
      { value: 'image/gif', label: 'image/gif' },
      { value: 'image/webp', label: 'image/webp' },
    ],
  },
  { kind: 'pill', key: 'model', label: 'Model', placeholder: 'claude-sonnet-4-6' },
];

export function ClaudeVisionForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="anthropic-vision-form"
      provider="anthropic"
      providerLabel="Anthropic"
      schema={anthropicVisionConfigSchema}
      fields={FIELDS}
    />
  );
}
