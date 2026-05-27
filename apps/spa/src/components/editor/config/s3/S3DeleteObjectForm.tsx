import { s3DeleteObjectConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
  { kind: 'pill', key: 'key', label: 'Key', placeholder: 'path/to/file.txt', required: true },
];

export function S3DeleteObjectForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="s3-delete-object-form"
      provider="s3"
      providerLabel="S3"
      schema={s3DeleteObjectConfigSchema}
      fields={FIELDS}
    />
  );
}
