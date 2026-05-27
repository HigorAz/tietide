import { s3ListObjectsConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
  { kind: 'pill', key: 'prefix', label: 'Prefix', placeholder: 'logs/' },
  { kind: 'pill', key: 'continuationToken', label: 'Continuation token' },
  { kind: 'number', key: 'maxKeys', label: 'Max keys (1–1000)', placeholder: '100' },
];

export function S3ListObjectsForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="s3-list-objects-form"
      provider="s3"
      providerLabel="S3"
      schema={s3ListObjectsConfigSchema}
      fields={FIELDS}
    />
  );
}
