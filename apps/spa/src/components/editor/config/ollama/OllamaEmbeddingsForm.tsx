import { ollamaEmbeddingsConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'prompt', label: 'Input text', multiline: true, required: true },
  {
    kind: 'pill',
    key: 'model',
    label: 'Model (defaults to connection)',
    placeholder: 'nomic-embed-text',
  },
];

export function OllamaEmbeddingsForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="ollama-embeddings-form"
      provider="ollama"
      providerLabel="Ollama"
      schema={ollamaEmbeddingsConfigSchema}
      fields={FIELDS}
    />
  );
}
