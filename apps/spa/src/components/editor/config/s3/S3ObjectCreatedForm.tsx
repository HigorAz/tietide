import { s3ObjectCreatedConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
  { kind: 'pill', key: 'prefix', label: 'Prefix', placeholder: 'incoming/' },
];

export function S3ObjectCreatedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="s3-object-created-form"
      provider="s3"
      providerLabel="S3"
      schema={s3ObjectCreatedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
