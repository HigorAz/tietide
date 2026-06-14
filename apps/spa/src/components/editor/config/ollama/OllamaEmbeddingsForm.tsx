import { ollamaEmbeddingsConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'prompt', label: 'Input text', multiline: true, required: true },
  {
    kind: 'ollama-model',
    key: 'model',
    label: 'Model (defaults to connection)',
    modelKind: 'embedding',
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
