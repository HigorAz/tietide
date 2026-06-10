import { openaiEmbeddingsConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'input', label: 'Input text', required: true },
  { kind: 'pill', key: 'model', label: 'Model', placeholder: 'text-embedding-3-small' },
];

export function OpenAIEmbeddingsForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="openai-embeddings-form"
      provider="openai"
      providerLabel="OpenAI"
      schema={openaiEmbeddingsConfigSchema}
      fields={FIELDS}
    />
  );
}
